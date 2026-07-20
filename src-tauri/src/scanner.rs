use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::env;
use std::fmt;
use std::fs::{self, File};
use std::io::{self, BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use chrono::{Local, TimeZone};
use serde::{Deserialize, Serialize};

use crate::pricing::{self, PricingMetadata};

const MAX_SCAN_DEPTH: usize = 7;
const MAX_WIRE_FILES: usize = 50_000;
const MAX_SCANNED_LINES: u64 = 1_000_000;
const MAX_USAGE_RECORD_BYTES: usize = 256 * 1024;
const MAX_MODEL_LENGTH: usize = 160;
const MAX_MODEL_BUCKETS: usize = 2_048;
const MAX_DAILY_BUCKETS: usize = 4_096;
const OVERFLOW_MODEL: &str = "other-models";
const MAX_CONFIG_BYTES: u64 = 1024 * 1024;
const MAX_CONFIG_MODELS: usize = 2_048;
const MAX_SESSION_LOG_BYTES: u64 = 8 * 1024 * 1024;
const MAX_SESSION_LOG_FILES: usize = 8;
const MAX_ENV_MODEL_SESSIONS: usize = 2_048;
const MAX_ENV_MODEL_EVENTS: usize = 100_000;
const ENV_MODEL_ALIAS: &str = "__kimi_env_model__";
const MAX_RECENT_RECORDS: usize = 100;
const MAX_CHART_DAYS: usize = 120;

#[derive(Debug)]
pub enum ScanError {
    InvalidHome(String),
    Io(io::Error),
}

impl fmt::Display for ScanError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidHome(message) => formatter.write_str(message),
            Self::Io(error) => write!(formatter, "Unable to read Kimi Code data: {error}"),
        }
    }
}

impl std::error::Error for ScanError {}

impl From<io::Error> for ScanError {
    fn from(value: io::Error) -> Self {
        Self::Io(value)
    }
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenTotals {
    pub input_other: u64,
    pub output: u64,
    pub input_cache_read: u64,
    pub input_cache_creation: u64,
    pub total: u64,
}

impl TokenTotals {
    fn add(&mut self, usage: &RawTokenUsage) {
        self.input_other = self.input_other.saturating_add(usage.input_other);
        self.output = self.output.saturating_add(usage.output);
        self.input_cache_read = self.input_cache_read.saturating_add(usage.input_cache_read);
        self.input_cache_creation = self
            .input_cache_creation
            .saturating_add(usage.input_cache_creation);
        self.total = self.total.saturating_add(usage.grand_total());
    }

    fn input_total(&self) -> u64 {
        self.input_other
            .saturating_add(self.input_cache_read)
            .saturating_add(self.input_cache_creation)
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyUsage {
    pub date: String,
    pub requests: u64,
    pub tokens: TokenTotals,
    pub cost_cny: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelUsage {
    pub model: String,
    pub aliases: Vec<String>,
    pub requests: u64,
    pub tokens: TokenTotals,
    pub cache_hit_rate: f64,
    pub cost_cny: Option<String>,
    pub pricing: Option<PricingMetadata>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentUsage {
    pub time: i64,
    pub model: String,
    pub session_id: String,
    pub agent: String,
    pub tokens: TokenTotals,
    pub cost_cny: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageReport {
    pub home: String,
    pub generated_at: i64,
    pub range_days: Option<u32>,
    pub requests: u64,
    pub sessions: u64,
    pub scanned_files: u64,
    pub scanned_lines: u64,
    pub parsed_records: u64,
    pub malformed_records: u64,
    pub oversized_records: u64,
    pub limits_reached: bool,
    pub unpriced_requests: u64,
    pub cache_hit_rate: f64,
    pub priced_cost_cny: String,
    pub tokens: TokenTotals,
    pub daily: Vec<DailyUsage>,
    pub models: Vec<ModelUsage>,
    pub recent: Vec<RecentUsage>,
}

#[derive(Debug, Deserialize)]
struct WireUsageRecord {
    #[serde(rename = "type")]
    record_type: String,
    model: String,
    time: Option<i64>,
    usage: RawTokenUsage,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawTokenUsage {
    input_other: u64,
    output: u64,
    input_cache_read: u64,
    input_cache_creation: u64,
}

impl RawTokenUsage {
    fn grand_total(&self) -> u64 {
        self.input_other
            .saturating_add(self.output)
            .saturating_add(self.input_cache_read)
            .saturating_add(self.input_cache_creation)
    }

    fn as_totals(&self) -> TokenTotals {
        let mut totals = TokenTotals::default();
        totals.add(self);
        totals
    }
}

#[derive(Default)]
struct Aggregate {
    requests: u64,
    totals: TokenTotals,
    cost_nanos: i128,
    priced_requests: u64,
}

#[derive(Default)]
struct ModelAggregate {
    aggregate: Aggregate,
    aliases: BTreeSet<String>,
}

#[derive(Default, Deserialize)]
struct KimiConfig {
    #[serde(default)]
    models: BTreeMap<String, ConfiguredModel>,
}

#[derive(Default, Deserialize)]
struct ConfiguredModel {
    model: Option<String>,
}

#[derive(Default)]
struct ModelResolver {
    aliases: HashMap<String, String>,
    session_events: HashMap<PathBuf, Vec<ModelAliasEvent>>,
    loaded_sessions: HashSet<PathBuf>,
    remaining_event_capacity: usize,
}

struct ModelAliasEvent {
    time: i64,
    model: String,
}

impl ModelResolver {
    fn from_home(home: &Path) -> Self {
        let mut resolver = Self {
            remaining_event_capacity: MAX_ENV_MODEL_EVENTS,
            ..Self::default()
        };
        let config = read_bounded_config(&home.join("config.toml"));
        let Some(config) = config else {
            return resolver;
        };
        resolver.aliases = config
            .models
            .into_iter()
            .take(MAX_CONFIG_MODELS)
            .filter_map(|(alias, configured)| {
                let alias = sanitize_model(&alias);
                let model = sanitize_model(configured.model.as_deref()?);
                (alias != "unknown" && model != "unknown").then_some((alias, model))
            })
            .collect();
        resolver
    }

    fn resolve(
        &mut self,
        recorded_model: &str,
        time: i64,
        wire_path: &Path,
    ) -> (String, Option<String>) {
        let original = sanitize_model(recorded_model);
        let configured = self.aliases.get(&original).cloned().or_else(|| {
            (original == ENV_MODEL_ALIAS)
                .then(|| self.resolve_session_model(wire_path, time))
                .flatten()
        });
        let target = configured.as_deref().unwrap_or(&original);
        let resolved = pricing::canonical_model(target)
            .unwrap_or(target)
            .to_string();
        let alias = (original != resolved).then_some(original);
        (resolved, alias)
    }

    fn resolve_session_model(&mut self, wire_path: &Path, time: i64) -> Option<String> {
        let session_root = session_root_for_wire(wire_path)?;
        if !self.loaded_sessions.contains(&session_root) {
            if self.loaded_sessions.len() >= MAX_ENV_MODEL_SESSIONS {
                return None;
            }
            let events = load_session_model_events(&session_root, self.remaining_event_capacity);
            self.remaining_event_capacity =
                self.remaining_event_capacity.saturating_sub(events.len());
            self.loaded_sessions.insert(session_root.clone());
            self.session_events.insert(session_root.clone(), events);
        }
        let events = self.session_events.get(&session_root)?;
        let index = events.partition_point(|event| event.time <= time);
        events
            .get(index.saturating_sub(1))
            .or_else(|| events.first())
            .map(|event| event.model.clone())
    }
}

impl Aggregate {
    fn add(&mut self, usage: &RawTokenUsage, cost_nanos: Option<i128>) {
        self.requests = self.requests.saturating_add(1);
        self.totals.add(usage);
        if let Some(cost) = cost_nanos {
            self.cost_nanos = self.cost_nanos.saturating_add(cost);
            self.priced_requests = self.priced_requests.saturating_add(1);
        }
    }
}

#[derive(Default)]
struct ScanState {
    aggregate: Aggregate,
    daily: BTreeMap<String, Aggregate>,
    models: HashMap<String, ModelAggregate>,
    recent: Vec<RecentUsage>,
    sessions: HashSet<String>,
    scanned_lines: u64,
    parsed_records: u64,
    malformed_records: u64,
    oversized_records: u64,
    limits_reached: bool,
}

pub fn default_kimi_home() -> Option<PathBuf> {
    match env::var_os("KIMI_CODE_HOME") {
        Some(value) if !value.is_empty() => return Some(PathBuf::from(value)),
        _ => {}
    }
    select_default_kimi_home(
        [env::var_os("HOME"), env::var_os("USERPROFILE")]
            .into_iter()
            .flatten()
            .filter(|value| !value.is_empty())
            .map(PathBuf::from),
    )
}

fn select_default_kimi_home(homes: impl IntoIterator<Item = PathBuf>) -> Option<PathBuf> {
    let mut seen = HashSet::new();
    let mut first = None;
    let mut existing = None;

    for home in homes {
        let candidate = home.join(".kimi-code");
        if !seen.insert(candidate.clone()) {
            continue;
        }
        first.get_or_insert_with(|| candidate.clone());
        if candidate.join("sessions").is_dir() {
            return Some(candidate);
        }
        if existing.is_none() && candidate.is_dir() {
            existing = Some(candidate);
        }
    }

    existing.or(first)
}

pub fn scan(home: Option<&str>, days: Option<u32>) -> Result<UsageReport, ScanError> {
    let home = resolve_home(home)?;
    let sessions_root = home.join("sessions");
    if !sessions_root.is_dir() {
        return Err(ScanError::InvalidHome(format!(
            "No Kimi Code sessions directory was found at {}",
            sessions_root.display()
        )));
    }

    let mut wire_files = Vec::new();
    collect_wire_files(&sessions_root, 0, &mut wire_files)?;
    wire_files.sort_unstable();

    let now = now_millis();
    let range_days = days
        .filter(|value| *value > 0)
        .map(|value| value.min(3_650));
    let cutoff = cutoff_for_range(now, range_days);
    let mut state = ScanState::default();
    let mut resolver = ModelResolver::from_home(&home);

    for path in &wire_files {
        if scan_wire_file(path, cutoff, &mut resolver, &mut state)? {
            break;
        }
    }

    Ok(build_report(home, now, range_days, wire_files.len(), state))
}

fn resolve_home(home: Option<&str>) -> Result<PathBuf, ScanError> {
    let path = match home.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => PathBuf::from(value),
        None => default_kimi_home().ok_or_else(|| {
            ScanError::InvalidHome("Unable to locate the current user home directory".to_string())
        })?,
    };
    if !path.is_dir() {
        return Err(ScanError::InvalidHome(format!(
            "Kimi Code data directory does not exist: {}",
            path.display()
        )));
    }
    Ok(path)
}

fn collect_wire_files(
    directory: &Path,
    depth: usize,
    files: &mut Vec<PathBuf>,
) -> Result<(), ScanError> {
    if depth > MAX_SCAN_DEPTH || files.len() >= MAX_WIRE_FILES {
        return Ok(());
    }
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::PermissionDenied => return Ok(()),
        Err(error) => return Err(error.into()),
    };
    for entry in entries {
        if files.len() >= MAX_WIRE_FILES {
            break;
        }
        let entry = entry?;
        let file_type = entry.file_type()?;
        if file_type.is_symlink() {
            continue;
        }
        let path = entry.path();
        if file_type.is_dir() {
            collect_wire_files(&path, depth + 1, files)?;
        } else if file_type.is_file() && entry.file_name() == "wire.jsonl" {
            files.push(path);
        }
    }
    Ok(())
}

fn scan_wire_file(
    path: &Path,
    cutoff: Option<i64>,
    resolver: &mut ModelResolver,
    state: &mut ScanState,
) -> Result<bool, ScanError> {
    let file = File::open(path)?;
    let mut reader = BufReader::with_capacity(64 * 1024, file);
    let mut line = Vec::with_capacity(512);

    while let Some(oversized) = read_capped_line(&mut reader, &mut line)? {
        if state.scanned_lines >= MAX_SCANNED_LINES {
            state.limits_reached = true;
            return Ok(true);
        }
        state.scanned_lines = state.scanned_lines.saturating_add(1);
        if oversized {
            state.oversized_records = state.oversized_records.saturating_add(1);
            continue;
        }
        if !contains_bytes(&line, b"usage.record") {
            continue;
        }
        let record: WireUsageRecord = match serde_json::from_slice(&line) {
            Ok(record) => record,
            Err(_) => {
                state.malformed_records = state.malformed_records.saturating_add(1);
                continue;
            }
        };
        if record.record_type != "usage.record" || record.usage.grand_total() == 0 {
            continue;
        }
        let time = normalize_timestamp(record.time.unwrap_or_default());
        if cutoff.is_some_and(|value| time < value) {
            continue;
        }
        consume_record(path, record, time, resolver, state);
    }
    Ok(false)
}

fn consume_record(
    path: &Path,
    record: WireUsageRecord,
    time: i64,
    resolver: &mut ModelResolver,
    state: &mut ScanState,
) {
    let (model, alias) = resolver.resolve(&record.model, time, path);
    let price = pricing::find(&model);
    let cost_nanos = price.map(|price| {
        price.calculate_nanos(
            record.usage.input_other,
            record.usage.output,
            record.usage.input_cache_read,
            record.usage.input_cache_creation,
        )
    });
    let (session_id, agent) = session_identity(path);
    let date = local_date(time);

    state.aggregate.add(&record.usage, cost_nanos);
    if state.daily.contains_key(&date) || state.daily.len() < MAX_DAILY_BUCKETS {
        state
            .daily
            .entry(date)
            .or_default()
            .add(&record.usage, cost_nanos);
    } else {
        state.limits_reached = true;
    }
    let model_bucket =
        if state.models.contains_key(&model) || state.models.len() < MAX_MODEL_BUCKETS {
            model.clone()
        } else {
            state.limits_reached = true;
            OVERFLOW_MODEL.to_string()
        };
    let model_aggregate = state.models.entry(model_bucket.clone()).or_default();
    model_aggregate.aggregate.add(&record.usage, cost_nanos);
    if model_bucket != OVERFLOW_MODEL
        && let Some(alias) = alias
    {
        model_aggregate.aliases.insert(alias);
    }
    state.sessions.insert(session_id.clone());
    state.parsed_records = state.parsed_records.saturating_add(1);

    state.recent.push(RecentUsage {
        time,
        model,
        session_id,
        agent,
        tokens: record.usage.as_totals(),
        cost_cny: cost_nanos.map(pricing::format_cny_nanos),
    });
    if state.recent.len() > MAX_RECENT_RECORDS {
        state
            .recent
            .sort_unstable_by_key(|record| std::cmp::Reverse(record.time));
        state.recent.truncate(MAX_RECENT_RECORDS);
    }
}

fn build_report(
    home: PathBuf,
    now: i64,
    range_days: Option<u32>,
    scanned_files: usize,
    mut state: ScanState,
) -> UsageReport {
    state
        .recent
        .sort_unstable_by_key(|record| std::cmp::Reverse(record.time));

    let mut daily = state
        .daily
        .into_iter()
        .map(|(date, aggregate)| DailyUsage {
            date,
            requests: aggregate.requests,
            tokens: aggregate.totals,
            cost_cny: pricing::format_cny_nanos(aggregate.cost_nanos),
        })
        .collect::<Vec<_>>();
    if daily.len() > MAX_CHART_DAYS {
        daily.drain(0..daily.len() - MAX_CHART_DAYS);
    }

    let mut models = state
        .models
        .into_iter()
        .map(|(model, model_aggregate)| {
            let aggregate = model_aggregate.aggregate;
            let cache_hit_rate = cache_hit_rate(&aggregate.totals);
            let fully_priced = aggregate.requests == aggregate.priced_requests;
            ModelUsage {
                pricing: pricing::metadata(&model),
                model,
                aliases: model_aggregate.aliases.into_iter().collect(),
                requests: aggregate.requests,
                tokens: aggregate.totals,
                cache_hit_rate,
                cost_cny: fully_priced.then(|| pricing::format_cny_nanos(aggregate.cost_nanos)),
            }
        })
        .collect::<Vec<_>>();
    models.sort_unstable_by(|a, b| {
        b.tokens
            .total
            .cmp(&a.tokens.total)
            .then_with(|| a.model.cmp(&b.model))
    });

    let cache_hit_rate = cache_hit_rate(&state.aggregate.totals);
    UsageReport {
        home: home.to_string_lossy().into_owned(),
        generated_at: now,
        range_days,
        requests: state.aggregate.requests,
        sessions: state.sessions.len() as u64,
        scanned_files: scanned_files as u64,
        scanned_lines: state.scanned_lines,
        parsed_records: state.parsed_records,
        malformed_records: state.malformed_records,
        oversized_records: state.oversized_records,
        limits_reached: state.limits_reached,
        unpriced_requests: state
            .aggregate
            .requests
            .saturating_sub(state.aggregate.priced_requests),
        cache_hit_rate,
        priced_cost_cny: pricing::format_cny_nanos(state.aggregate.cost_nanos),
        tokens: state.aggregate.totals,
        daily,
        models,
        recent: state.recent,
    }
}

fn read_bounded_config(path: &Path) -> Option<KimiConfig> {
    let mut bytes = Vec::new();
    File::open(path)
        .ok()?
        .take(MAX_CONFIG_BYTES.saturating_add(1))
        .read_to_end(&mut bytes)
        .ok()?;
    if bytes.len() as u64 > MAX_CONFIG_BYTES {
        return None;
    }
    let text = std::str::from_utf8(&bytes).ok()?;
    toml::from_str(text).ok()
}

fn session_root_for_wire(path: &Path) -> Option<PathBuf> {
    let agents = path.parent()?.parent()?;
    (agents.file_name()? == "agents").then(|| agents.parent().map(Path::to_path_buf))?
}

fn load_session_model_events(session_root: &Path, limit: usize) -> Vec<ModelAliasEvent> {
    if limit == 0 {
        return Vec::new();
    }
    let logs = session_root.join("logs");
    let Ok(entries) = fs::read_dir(logs) else {
        return Vec::new();
    };
    let mut paths = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let file_type = entry.file_type().ok()?;
            let name = entry.file_name();
            let name = name.to_str()?;
            (file_type.is_file() && !file_type.is_symlink() && name.starts_with("kimi-code.log"))
                .then(|| entry.path())
        })
        .collect::<Vec<_>>();
    paths.sort_unstable();
    paths.truncate(MAX_SESSION_LOG_FILES);

    let mut events = Vec::new();
    for path in paths {
        let Ok(file) = File::open(path) else {
            continue;
        };
        let mut reader = BufReader::with_capacity(32 * 1024, file.take(MAX_SESSION_LOG_BYTES));
        let mut line = Vec::with_capacity(256);
        while events.len() < limit {
            let Ok(next) = read_capped_line(&mut reader, &mut line) else {
                break;
            };
            let Some(oversized) = next else {
                break;
            };
            if oversized || !contains_bytes(&line, ENV_MODEL_ALIAS.as_bytes()) {
                continue;
            }
            if let Some(event) = parse_session_model_event(&line) {
                events.push(event);
            }
        }
        if events.len() >= limit {
            break;
        }
    }
    events.sort_unstable_by_key(|event| event.time);
    events
}

fn parse_session_model_event(line: &[u8]) -> Option<ModelAliasEvent> {
    let line = std::str::from_utf8(line).ok()?;
    let mut fields = line.split_ascii_whitespace();
    let time = chrono::DateTime::parse_from_rfc3339(fields.next()?)
        .ok()?
        .timestamp_millis();
    let mut model = None;
    let mut is_env_alias = false;
    for field in fields {
        if let Some(value) = field.strip_prefix("model=") {
            model = Some(sanitize_model(value));
        } else if let Some(value) = field.strip_prefix("modelAlias=") {
            is_env_alias = value == ENV_MODEL_ALIAS;
        }
    }
    let model = model?;
    (is_env_alias && model != "unknown").then_some(ModelAliasEvent { time, model })
}

fn cache_hit_rate(totals: &TokenTotals) -> f64 {
    let input = totals.input_total();
    if input == 0 {
        0.0
    } else {
        totals.input_cache_read as f64 / input as f64
    }
}

fn read_capped_line<R: BufRead>(reader: &mut R, output: &mut Vec<u8>) -> io::Result<Option<bool>> {
    output.clear();
    let mut saw_bytes = false;
    let mut oversized = false;

    loop {
        let (consume, found_newline, reached_end) = {
            let available = reader.fill_buf()?;
            if available.is_empty() {
                (0, false, true)
            } else {
                saw_bytes = true;
                let newline = available.iter().position(|byte| *byte == b'\n');
                let content_len = newline.unwrap_or(available.len());
                if !oversized {
                    let remaining = MAX_USAGE_RECORD_BYTES.saturating_sub(output.len());
                    let copy_len = content_len.min(remaining);
                    output.extend_from_slice(&available[..copy_len]);
                    if copy_len < content_len || output.len() >= MAX_USAGE_RECORD_BYTES {
                        oversized = true;
                    }
                }
                (
                    content_len + usize::from(newline.is_some()),
                    newline.is_some(),
                    false,
                )
            }
        };
        if reached_end {
            return Ok(saw_bytes.then_some(oversized));
        }
        reader.consume(consume);
        if found_newline {
            return Ok(Some(oversized));
        }
    }
}

fn contains_bytes(haystack: &[u8], needle: &[u8]) -> bool {
    haystack
        .windows(needle.len())
        .any(|window| window == needle)
}

fn sanitize_model(model: &str) -> String {
    let value = model.trim();
    let mut end = value.len().min(MAX_MODEL_LENGTH);
    while !value.is_char_boundary(end) {
        end -= 1;
    }
    let value = &value[..end];
    if value.is_empty() {
        "unknown".to_string()
    } else {
        value.to_string()
    }
}

fn normalize_timestamp(value: i64) -> i64 {
    if value <= 0 {
        return now_millis();
    }
    if value < 10_000_000_000 {
        value.saturating_mul(1_000)
    } else {
        value
    }
}

fn cutoff_for_range(now: i64, range_days: Option<u32>) -> Option<i64> {
    match range_days {
        Some(1) => Local
            .timestamp_millis_opt(now)
            .single()?
            .date_naive()
            .and_hms_opt(0, 0, 0)
            .and_then(|start| Local.from_local_datetime(&start).earliest())
            .map(|start| start.timestamp_millis()),
        Some(days) => {
            Some(now.saturating_sub(i64::from(days).saturating_mul(24 * 60 * 60 * 1_000)))
        }
        None => None,
    }
}

fn local_date(time: i64) -> String {
    Local
        .timestamp_millis_opt(time)
        .single()
        .map(|value| value.format("%Y-%m-%d").to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

fn session_identity(path: &Path) -> (String, String) {
    let components = path
        .components()
        .map(|component| component.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>();
    if let Some(index) = components
        .iter()
        .position(|component| component == "agents")
    {
        let session = index
            .checked_sub(1)
            .and_then(|value| components.get(value))
            .cloned()
            .unwrap_or_else(|| "unknown".to_string());
        let agent = components
            .get(index + 1)
            .cloned()
            .unwrap_or_else(|| "unknown".to_string());
        return (session, agent);
    }
    ("unknown".to_string(), "unknown".to_string())
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis().min(i64::MAX as u128) as i64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn default_home_prefers_the_candidate_with_kimi_sessions() {
        let temporary = tempfile::tempdir().expect("temporary directory");
        let home = temporary.path().join("home");
        let user_profile = temporary.path().join("user-profile");
        fs::create_dir_all(home.join(".kimi-code")).expect("home Kimi directory");
        fs::create_dir_all(user_profile.join(".kimi-code/sessions"))
            .expect("profile Kimi sessions");

        assert_eq!(
            select_default_kimi_home([home, user_profile.clone()]),
            Some(user_profile.join(".kimi-code"))
        );
    }

    #[test]
    fn default_home_falls_back_to_the_first_user_home() {
        let temporary = tempfile::tempdir().expect("temporary directory");
        let home = temporary.path().join("home");
        let user_profile = temporary.path().join("user-profile");

        assert_eq!(
            select_default_kimi_home([home.clone(), user_profile]),
            Some(home.join(".kimi-code"))
        );
    }

    #[test]
    fn scans_only_usage_records_and_separates_cache_reads() {
        let temporary = tempfile::tempdir().expect("temporary directory");
        let agent = temporary
            .path()
            .join("sessions/wd_demo/session-1/agents/main");
        fs::create_dir_all(&agent).expect("agent directory");
        let mut wire = File::create(agent.join("wire.jsonl")).expect("wire file");
        writeln!(
            wire,
            "{}",
            serde_json::json!({
                "type": "context.append_loop_event",
                "event": {"usage": {"inputOther": 99, "output": 99, "inputCacheRead": 99, "inputCacheCreation": 0}},
                "time": 1_784_500_000_000i64
            })
        )
        .expect("context record");
        writeln!(
            wire,
            "{}",
            serde_json::json!({
                "type": "usage.record",
                "model": "kimi-k3",
                "usage": {"inputOther": 100, "output": 20, "inputCacheRead": 80, "inputCacheCreation": 0},
                "usageScope": "turn",
                "time": 1_784_500_000_000i64
            })
        )
        .expect("usage record");

        let report = scan(temporary.path().to_str(), None).expect("usage report");
        assert_eq!(report.requests, 1);
        assert_eq!(report.tokens.input_other, 100);
        assert_eq!(report.tokens.output, 20);
        assert_eq!(report.tokens.input_cache_read, 80);
        assert_eq!(report.tokens.total, 200);
        assert_eq!(report.sessions, 1);
        assert_eq!(report.unpriced_requests, 0);
    }

    #[test]
    fn prices_environment_defined_k3_alias() {
        let temporary = tempfile::tempdir().expect("temporary directory");
        write_usage_record(temporary.path(), "k3");

        let report = scan(temporary.path().to_str(), None).expect("usage report");
        assert_eq!(report.models.len(), 1);
        assert_eq!(report.models[0].model, "kimi-k3");
        assert_eq!(report.models[0].aliases, ["k3"]);
        assert!(report.models[0].cost_cny.is_some());
        assert_eq!(report.unpriced_requests, 0);
    }

    #[test]
    fn resolves_kimi_internal_environment_alias_from_session_log() {
        let temporary = tempfile::tempdir().expect("temporary directory");
        write_usage_record(temporary.path(), ENV_MODEL_ALIAS);
        let logs = temporary.path().join("sessions/wd_demo/session-1/logs");
        fs::create_dir_all(&logs).expect("logs directory");
        fs::write(
            logs.join("kimi-code.log"),
            "2026-01-01T00:00:00.000Z INFO llm config provider=openai model=kimi-k3 modelAlias=__kimi_env_model__ thinkingEffort=high\n",
        )
        .expect("session log");

        let report = scan(temporary.path().to_str(), None).expect("usage report");
        assert_eq!(report.models.len(), 1);
        assert_eq!(report.models[0].model, "kimi-k3");
        assert_eq!(report.models[0].aliases, [ENV_MODEL_ALIAS]);
        assert!(report.models[0].cost_cny.is_some());
        assert_eq!(report.unpriced_requests, 0);
    }

    #[test]
    fn resolves_configured_model_alias_without_exposing_provider_config() {
        let temporary = tempfile::tempdir().expect("temporary directory");
        fs::write(
            temporary.path().join("config.toml"),
            r#"
[providers.custom]
type = "kimi"
api_key = "EXAMPLE_KEY_NOT_USED"

[models."my-k3"]
provider = "custom"
model = "kimi-k3"
max_context_size = 1048576
"#,
        )
        .expect("config file");
        write_usage_record(temporary.path(), "my-k3");

        let report = scan(temporary.path().to_str(), None).expect("usage report");
        assert_eq!(report.models[0].model, "kimi-k3");
        assert_eq!(report.models[0].aliases, ["my-k3"]);
        assert!(report.models[0].pricing.is_some());
        assert_eq!(report.unpriced_requests, 0);
    }

    #[test]
    fn keeps_managed_subscription_model_unpriced() {
        let temporary = tempfile::tempdir().expect("temporary directory");
        write_usage_record(temporary.path(), "kimi-for-coding");

        let report = scan(temporary.path().to_str(), None).expect("usage report");
        assert_eq!(report.models[0].model, "kimi-for-coding");
        assert!(report.models[0].cost_cny.is_none());
        assert_eq!(report.unpriced_requests, 1);
    }

    #[test]
    fn bounds_distinct_model_buckets() {
        let temporary = tempfile::tempdir().expect("temporary directory");
        let agent = temporary
            .path()
            .join("sessions/wd_demo/session-1/agents/main");
        fs::create_dir_all(&agent).expect("agent directory");
        let mut wire = File::create(agent.join("wire.jsonl")).expect("wire file");
        for index in 0..MAX_MODEL_BUCKETS + 2 {
            writeln!(
                wire,
                "{}",
                serde_json::json!({
                    "type": "usage.record",
                    "model": format!("custom-model-{index}"),
                    "usage": {"inputOther": 1, "output": 0, "inputCacheRead": 0, "inputCacheCreation": 0},
                    "time": 1_784_500_000_000i64
                })
            )
            .expect("usage record");
        }

        let report = scan(temporary.path().to_str(), None).expect("usage report");
        let overflow = report
            .models
            .iter()
            .find(|model| model.model == OVERFLOW_MODEL)
            .expect("overflow model bucket");
        assert_eq!(report.models.len(), MAX_MODEL_BUCKETS + 1);
        assert_eq!(overflow.requests, 2);
        assert!(report.limits_reached);
    }

    fn write_usage_record(home: &Path, model: &str) {
        let agent = home.join("sessions/wd_demo/session-1/agents/main");
        fs::create_dir_all(&agent).expect("agent directory");
        let mut wire = File::create(agent.join("wire.jsonl")).expect("wire file");
        writeln!(
            wire,
            "{}",
            serde_json::json!({
                "type": "usage.record",
                "model": model,
                "usage": {"inputOther": 100, "output": 20, "inputCacheRead": 80, "inputCacheCreation": 0},
                "usageScope": "turn",
                "time": 1_784_500_000_000i64
            })
        )
        .expect("usage record");
    }

    #[test]
    fn capped_reader_discards_large_non_usage_lines_without_growing_output() {
        let large = vec![b'x'; MAX_USAGE_RECORD_BYTES + 32];
        let mut input = large;
        input.push(b'\n');
        input.extend_from_slice(b"small\n");
        let mut reader = BufReader::new(input.as_slice());
        let mut output = Vec::new();

        assert_eq!(
            read_capped_line(&mut reader, &mut output).unwrap(),
            Some(true)
        );
        assert!(output.len() <= MAX_USAGE_RECORD_BYTES);
        assert_eq!(
            read_capped_line(&mut reader, &mut output).unwrap(),
            Some(false)
        );
        assert_eq!(output, b"small");
    }

    #[test]
    fn today_range_starts_at_local_midnight() {
        let now = Local::now();
        let cutoff = cutoff_for_range(now.timestamp_millis(), Some(1)).expect("today cutoff");
        let cutoff = Local
            .timestamp_millis_opt(cutoff)
            .single()
            .expect("local cutoff");

        assert_eq!(cutoff.date_naive(), now.date_naive());
        assert_eq!(cutoff.format("%H:%M:%S").to_string(), "00:00:00");
    }
}
