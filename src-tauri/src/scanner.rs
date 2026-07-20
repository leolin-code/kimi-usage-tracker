use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::env;
use std::fmt;
use std::fs::{self, File};
use std::io::{self, BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use chrono::{Datelike, Local, TimeZone, Timelike};
use serde::{Deserialize, Serialize};

use crate::pricing::{self, PricingMetadata};

const MAX_SCAN_DEPTH: usize = 7;
const MAX_WIRE_FILES: usize = 50_000;
const MAX_SCANNED_LINES: u64 = 1_000_000;
const MAX_USAGE_RECORD_BYTES: usize = 256 * 1024;
const MAX_MODEL_LENGTH: usize = 160;
const MAX_MODEL_BUCKETS: usize = 2_048;
const MAX_SERIES_BUCKETS: usize = 4_096;
const MAX_DIMENSION_VALUES: usize = 2_000;
const OVERFLOW_MODEL: &str = "other-models";
const UNSPECIFIED_SCOPE: &str = "未标注";
const MAX_CONFIG_BYTES: u64 = 1024 * 1024;
const MAX_CONFIG_MODELS: usize = 2_048;
const MAX_SESSION_LOG_BYTES: u64 = 8 * 1024 * 1024;
const MAX_SESSION_LOG_FILES: usize = 8;
const MAX_ENV_MODEL_SESSIONS: usize = 2_048;
const MAX_ENV_MODEL_EVENTS: usize = 100_000;
const ENV_MODEL_ALIAS: &str = "__kimi_env_model__";
const MAX_RECENT_RECORDS: usize = 1_000;

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

    fn merge(&mut self, other: &TokenTotals) {
        self.input_other = self.input_other.saturating_add(other.input_other);
        self.output = self.output.saturating_add(other.output);
        self.input_cache_read = self.input_cache_read.saturating_add(other.input_cache_read);
        self.input_cache_creation = self
            .input_cache_creation
            .saturating_add(other.input_cache_creation);
        self.total = self.total.saturating_add(other.total);
    }

    fn input_total(&self) -> u64 {
        self.input_other
            .saturating_add(self.input_cache_read)
            .saturating_add(self.input_cache_creation)
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeriesBucket {
    pub start_ms: i64,
    pub requests: u64,
    pub tokens: TokenTotals,
    pub cost_cny: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DimensionValue {
    pub value: String,
    pub requests: u64,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterDimensions {
    pub models: Vec<DimensionValue>,
    pub sessions: Vec<DimensionValue>,
    pub agents: Vec<DimensionValue>,
    pub scopes: Vec<DimensionValue>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComparisonSummary {
    pub requests: u64,
    pub sessions: u64,
    pub tokens: TokenTotals,
    pub cache_hit_rate: f64,
    pub priced_cost_cny: String,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CostSegments {
    pub input_other: String,
    pub cache_read: String,
    pub cache_creation: String,
    pub output: String,
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
    pub scope: String,
    pub tokens: TokenTotals,
    pub cost_cny: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageReport {
    pub home: String,
    pub generated_at: i64,
    pub granularity: String,
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
    pub cost_segments: CostSegments,
    pub series: Vec<SeriesBucket>,
    pub dimensions: FilterDimensions,
    pub comparison: Option<ComparisonSummary>,
    pub models: Vec<ModelUsage>,
    pub recent: Vec<RecentUsage>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ScanFilter {
    pub start_ms: Option<i64>,
    pub end_ms: Option<i64>,
    pub models: Vec<String>,
    pub sessions: Vec<String>,
    pub agents: Vec<String>,
    pub scopes: Vec<String>,
    pub billing: String,
    pub granularity: String,
}

impl Default for ScanFilter {
    fn default() -> Self {
        Self {
            start_ms: None,
            end_ms: None,
            models: Vec::new(),
            sessions: Vec::new(),
            agents: Vec::new(),
            scopes: Vec::new(),
            billing: "all".to_string(),
            granularity: "auto".to_string(),
        }
    }
}

#[derive(Debug, Deserialize)]
struct WireUsageRecord {
    #[serde(rename = "type")]
    record_type: String,
    model: String,
    time: Option<i64>,
    usage: RawTokenUsage,
    #[serde(rename = "usageScope")]
    usage_scope: Option<String>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, PartialOrd, Ord)]
enum Granularity {
    #[default]
    Minute,
    Hour,
    Day,
    Week,
    Month,
}

impl Granularity {
    fn parse(value: &str) -> Option<Self> {
        match value {
            "minute" => Some(Self::Minute),
            "hour" => Some(Self::Hour),
            "day" => Some(Self::Day),
            "week" => Some(Self::Week),
            "month" => Some(Self::Month),
            _ => None,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Minute => "minute",
            Self::Hour => "hour",
            Self::Day => "day",
            Self::Week => "week",
            Self::Month => "month",
        }
    }

    fn coarser(self) -> Option<Self> {
        match self {
            Self::Minute => Some(Self::Hour),
            Self::Hour => Some(Self::Day),
            Self::Day => Some(Self::Week),
            Self::Week => Some(Self::Month),
            Self::Month => None,
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
enum BillingFilter {
    #[default]
    All,
    Priced,
    Unpriced,
}

impl BillingFilter {
    fn parse(value: &str) -> Self {
        match value {
            "priced" => Self::Priced,
            "unpriced" => Self::Unpriced,
            _ => Self::All,
        }
    }

    fn matches(self, priced: bool) -> bool {
        match self {
            Self::All => true,
            Self::Priced => priced,
            Self::Unpriced => !priced,
        }
    }
}

#[derive(Default)]
struct ResolvedFilter {
    start_ms: Option<i64>,
    end_ms: Option<i64>,
    models: Vec<String>,
    sessions: Vec<String>,
    agents: Vec<String>,
    scopes: Vec<String>,
    billing: BillingFilter,
    granularity: Option<Granularity>,
}

impl ResolvedFilter {
    fn from_filter(filter: Option<ScanFilter>) -> Self {
        let filter = filter.unwrap_or_default();
        Self {
            start_ms: filter.start_ms,
            end_ms: filter.end_ms,
            models: filter.models,
            sessions: filter.sessions,
            agents: filter.agents,
            scopes: filter.scopes,
            billing: BillingFilter::parse(&filter.billing),
            granularity: Granularity::parse(&filter.granularity),
        }
    }

    fn matches(&self, model: &str, session: &str, agent: &str, scope: &str, priced: bool) -> bool {
        (self.models.is_empty() || self.models.iter().any(|value| value == model))
            && (self.sessions.is_empty() || self.sessions.iter().any(|value| value == session))
            && (self.agents.is_empty() || self.agents.iter().any(|value| value == agent))
            && (self.scopes.is_empty() || self.scopes.iter().any(|value| value == scope))
            && self.billing.matches(priced)
    }

    fn comparison_window(&self) -> Option<(i64, i64)> {
        let (Some(start), Some(end)) = (self.start_ms, self.end_ms) else {
            return None;
        };
        if end < start {
            return None;
        }
        let length = end.saturating_sub(start).saturating_add(1);
        Some((start.saturating_sub(length), start.saturating_sub(1)))
    }
}

#[derive(Clone, Copy)]
enum RecordWindow {
    Main,
    Comparison,
    Skip,
}

fn classify_window(time: i64, filter: &ResolvedFilter) -> RecordWindow {
    let in_main = filter.start_ms.is_none_or(|start| time >= start)
        && filter.end_ms.is_none_or(|end| time <= end);
    if in_main {
        return RecordWindow::Main;
    }
    if let Some((comparison_start, comparison_end)) = filter.comparison_window()
        && time >= comparison_start
        && time <= comparison_end
    {
        return RecordWindow::Comparison;
    }
    RecordWindow::Skip
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

    fn merge(&mut self, other: &Aggregate) {
        self.requests = self.requests.saturating_add(other.requests);
        self.totals.merge(&other.totals);
        self.cost_nanos = self.cost_nanos.saturating_add(other.cost_nanos);
        self.priced_requests = self.priced_requests.saturating_add(other.priced_requests);
    }
}

#[derive(Default)]
struct DimensionCounts {
    models: BTreeMap<String, u64>,
    sessions: BTreeMap<String, u64>,
    agents: BTreeMap<String, u64>,
    scopes: BTreeMap<String, u64>,
}

impl DimensionCounts {
    fn add(&mut self, model: &str, session: &str, agent: &str, scope: &str) -> bool {
        let mut limited = false;
        limited |= bump_dimension(&mut self.models, model);
        limited |= bump_dimension(&mut self.sessions, session);
        limited |= bump_dimension(&mut self.agents, agent);
        limited |= bump_dimension(&mut self.scopes, scope);
        limited
    }
}

fn bump_dimension(map: &mut BTreeMap<String, u64>, value: &str) -> bool {
    if let Some(count) = map.get_mut(value) {
        *count = count.saturating_add(1);
        false
    } else if map.len() < MAX_DIMENSION_VALUES {
        map.insert(value.to_string(), 1);
        false
    } else {
        true
    }
}

#[derive(Default)]
struct ComparisonState {
    aggregate: Aggregate,
    sessions: HashSet<String>,
}

#[derive(Default)]
struct ScanState {
    aggregate: Aggregate,
    cost_segments: [i128; 4],
    series: BTreeMap<i64, Aggregate>,
    series_granularity: Granularity,
    auto_granularity: bool,
    min_time: Option<i64>,
    max_time: Option<i64>,
    models: HashMap<String, ModelAggregate>,
    recent: Vec<RecentUsage>,
    sessions: HashSet<String>,
    dimensions: DimensionCounts,
    comparison: ComparisonState,
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

pub fn scan(home: Option<&str>, filter: Option<ScanFilter>) -> Result<UsageReport, ScanError> {
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
    let filter = ResolvedFilter::from_filter(filter);
    let (series_granularity, auto_granularity) = match filter.granularity {
        Some(granularity) => (granularity, false),
        None => {
            let initial = match (filter.start_ms, filter.end_ms) {
                (Some(start), Some(end)) if end >= start => {
                    auto_granularity(end.saturating_sub(start))
                }
                _ => Granularity::Minute,
            };
            (initial, true)
        }
    };
    let mut state = ScanState {
        series_granularity,
        auto_granularity,
        ..ScanState::default()
    };
    let mut resolver = ModelResolver::from_home(&home);

    for path in &wire_files {
        if scan_wire_file(path, &filter, &mut resolver, &mut state)? {
            break;
        }
    }

    Ok(build_report(home, now, &filter, wire_files.len(), state))
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
    filter: &ResolvedFilter,
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
        match classify_window(time, filter) {
            RecordWindow::Main => consume_main_record(path, record, time, filter, resolver, state),
            RecordWindow::Comparison => {
                consume_comparison_record(path, record, time, filter, resolver, state)
            }
            RecordWindow::Skip => {}
        }
    }
    Ok(false)
}

fn record_scope(record: &WireUsageRecord) -> String {
    record
        .usage_scope
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(UNSPECIFIED_SCOPE)
        .to_string()
}

fn consume_main_record(
    path: &Path,
    record: WireUsageRecord,
    time: i64,
    filter: &ResolvedFilter,
    resolver: &mut ModelResolver,
    state: &mut ScanState,
) {
    let (model, alias) = resolver.resolve(&record.model, time, path);
    let price = pricing::find(&model);
    let (session_id, agent) = session_identity(path);
    let scope = record_scope(&record);

    if state.dimensions.add(&model, &session_id, &agent, &scope) {
        state.limits_reached = true;
    }
    if !filter.matches(&model, &session_id, &agent, &scope, price.is_some()) {
        return;
    }

    let cost_nanos = price.map(|price| {
        price.calculate_nanos(
            record.usage.input_other,
            record.usage.output,
            record.usage.input_cache_read,
            record.usage.input_cache_creation,
        )
    });
    if let Some(price) = price {
        let segments = price.calculate_segments_nanos(
            record.usage.input_other,
            record.usage.output,
            record.usage.input_cache_read,
            record.usage.input_cache_creation,
        );
        for (index, segment) in segments.iter().enumerate() {
            state.cost_segments[index] = state.cost_segments[index].saturating_add(*segment);
        }
    }

    state.aggregate.add(&record.usage, cost_nanos);
    state.min_time = Some(state.min_time.map_or(time, |value| value.min(time)));
    state.max_time = Some(state.max_time.map_or(time, |value| value.max(time)));
    insert_series_bucket(state, time, &record.usage, cost_nanos);
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
        scope,
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

fn consume_comparison_record(
    path: &Path,
    record: WireUsageRecord,
    time: i64,
    filter: &ResolvedFilter,
    resolver: &mut ModelResolver,
    state: &mut ScanState,
) {
    let (model, _) = resolver.resolve(&record.model, time, path);
    let price = pricing::find(&model);
    let (session_id, agent) = session_identity(path);
    let scope = record_scope(&record);
    if !filter.matches(&model, &session_id, &agent, &scope, price.is_some()) {
        return;
    }
    let cost_nanos = price.map(|price| {
        price.calculate_nanos(
            record.usage.input_other,
            record.usage.output,
            record.usage.input_cache_read,
            record.usage.input_cache_creation,
        )
    });
    state.comparison.aggregate.add(&record.usage, cost_nanos);
    state.comparison.sessions.insert(session_id);
}

fn insert_series_bucket(
    state: &mut ScanState,
    time: i64,
    usage: &RawTokenUsage,
    cost_nanos: Option<i128>,
) {
    let key = bucket_start(time, state.series_granularity);
    state.series.entry(key).or_default().add(usage, cost_nanos);
    while state.series.len() > MAX_SERIES_BUCKETS {
        let Some(coarser) = state.series_granularity.coarser() else {
            state.limits_reached = true;
            break;
        };
        rekey_series(&mut state.series, coarser);
        state.series_granularity = coarser;
    }
}

fn rekey_series(series: &mut BTreeMap<i64, Aggregate>, granularity: Granularity) {
    let previous = std::mem::take(series);
    for (key, aggregate) in previous {
        let key = bucket_start(key, granularity);
        series
            .entry(key)
            .and_modify(|existing| existing.merge(&aggregate))
            .or_insert(aggregate);
    }
}

fn build_report(
    home: PathBuf,
    now: i64,
    filter: &ResolvedFilter,
    scanned_files: usize,
    mut state: ScanState,
) -> UsageReport {
    state
        .recent
        .sort_unstable_by_key(|record| std::cmp::Reverse(record.time));

    if state.auto_granularity {
        let start = filter.start_ms.or(state.min_time);
        let end = filter.end_ms.or(state.max_time);
        if let (Some(start), Some(end)) = (start, end) {
            let desired = auto_granularity(end.saturating_sub(start));
            while state.series_granularity < desired {
                let Some(coarser) = state.series_granularity.coarser() else {
                    break;
                };
                rekey_series(&mut state.series, coarser);
                state.series_granularity = coarser;
            }
        }
    }

    let series = state
        .series
        .into_iter()
        .map(|(start_ms, aggregate)| SeriesBucket {
            start_ms,
            requests: aggregate.requests,
            tokens: aggregate.totals,
            cost_cny: pricing::format_cny_nanos(aggregate.cost_nanos),
        })
        .collect::<Vec<_>>();

    let dimensions = FilterDimensions {
        models: dimension_values(state.dimensions.models),
        sessions: dimension_values(state.dimensions.sessions),
        agents: dimension_values(state.dimensions.agents),
        scopes: dimension_values(state.dimensions.scopes),
    };

    let comparison = filter.comparison_window().map(|_| {
        let aggregate = state.comparison.aggregate;
        ComparisonSummary {
            requests: aggregate.requests,
            sessions: state.comparison.sessions.len() as u64,
            cache_hit_rate: cache_hit_rate(&aggregate.totals),
            priced_cost_cny: pricing::format_cny_nanos(aggregate.cost_nanos),
            tokens: aggregate.totals,
        }
    });

    let cost_segments = CostSegments {
        input_other: pricing::format_cny_nanos(state.cost_segments[0]),
        cache_read: pricing::format_cny_nanos(state.cost_segments[2]),
        cache_creation: pricing::format_cny_nanos(state.cost_segments[3]),
        output: pricing::format_cny_nanos(state.cost_segments[1]),
    };

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
        granularity: state.series_granularity.as_str().to_string(),
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
        cost_segments,
        series,
        dimensions,
        comparison,
        models,
        recent: state.recent,
    }
}

fn dimension_values(map: BTreeMap<String, u64>) -> Vec<DimensionValue> {
    let mut values = map
        .into_iter()
        .map(|(value, requests)| DimensionValue { value, requests })
        .collect::<Vec<_>>();
    values.sort_unstable_by(|a, b| {
        b.requests
            .cmp(&a.requests)
            .then_with(|| a.value.cmp(&b.value))
    });
    values
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

fn auto_granularity(span_ms: i64) -> Granularity {
    const HOUR_MS: i64 = 3_600_000;
    const DAY_MS: i64 = 86_400_000;
    if span_ms <= 6 * HOUR_MS {
        Granularity::Minute
    } else if span_ms <= 72 * HOUR_MS {
        Granularity::Hour
    } else if span_ms <= 120 * DAY_MS {
        Granularity::Day
    } else if span_ms <= 730 * DAY_MS {
        Granularity::Week
    } else {
        Granularity::Month
    }
}

fn local_midnight(date: chrono::NaiveDate) -> Option<i64> {
    date.and_hms_opt(0, 0, 0)
        .and_then(|start| Local.from_local_datetime(&start).earliest())
        .map(|start| start.timestamp_millis())
}

fn bucket_start(time: i64, granularity: Granularity) -> i64 {
    let Some(moment) = Local.timestamp_millis_opt(time).single() else {
        return time;
    };
    match granularity {
        Granularity::Minute => moment
            .with_second(0)
            .and_then(|value| value.with_nanosecond(0))
            .map(|value| value.timestamp_millis())
            .unwrap_or(time),
        Granularity::Hour => moment
            .with_minute(0)
            .and_then(|value| value.with_second(0))
            .and_then(|value| value.with_nanosecond(0))
            .map(|value| value.timestamp_millis())
            .unwrap_or(time),
        Granularity::Day => local_midnight(moment.date_naive()).unwrap_or(time),
        Granularity::Week => {
            let date = moment.date_naive();
            let monday = date
                .checked_sub_days(chrono::Days::new(u64::from(
                    date.weekday().num_days_from_monday(),
                )))
                .unwrap_or(date);
            local_midnight(monday).unwrap_or(time)
        }
        Granularity::Month => {
            let date = moment.date_naive();
            let first = date.with_day(1).unwrap_or(date);
            local_midnight(first).unwrap_or(time)
        }
    }
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

    fn write_records(home: &Path, session: &str, records: &[(&str, i64, Option<&str>, [u64; 4])]) {
        let agent = home.join(format!("sessions/wd_demo/{session}/agents/main"));
        fs::create_dir_all(&agent).expect("agent directory");
        let mut wire = File::create(agent.join("wire.jsonl")).expect("wire file");
        for (model, time, scope, usage) in records {
            let mut record = serde_json::json!({
                "type": "usage.record",
                "model": model,
                "usage": {
                    "inputOther": usage[0],
                    "output": usage[1],
                    "inputCacheRead": usage[2],
                    "inputCacheCreation": usage[3]
                },
                "time": time
            });
            if let Some(scope) = scope {
                record["usageScope"] = serde_json::json!(scope);
            }
            writeln!(wire, "{record}").expect("usage record");
        }
    }

    #[test]
    fn time_range_filter_includes_closed_bounds() {
        let temporary = tempfile::tempdir().expect("temporary directory");
        let base = 1_784_500_000_000i64;
        write_records(
            temporary.path(),
            "session-1",
            &[
                ("kimi-k3", base + 999, Some("turn"), [100, 20, 80, 0]),
                ("kimi-k3", base + 1_000, Some("turn"), [100, 20, 80, 0]),
                ("kimi-k3", base + 2_000, Some("turn"), [100, 20, 80, 0]),
                ("kimi-k3", base + 2_001, Some("turn"), [100, 20, 80, 0]),
            ],
        );

        let filter = ScanFilter {
            start_ms: Some(base + 1_000),
            end_ms: Some(base + 2_000),
            ..ScanFilter::default()
        };
        let report = scan(temporary.path().to_str(), Some(filter)).expect("usage report");
        assert_eq!(report.requests, 2);
        assert_eq!(report.tokens.total, 400);
        // base + 999 落在等长上一周期窗口内，只计入 comparison。
        let comparison = report.comparison.expect("comparison summary");
        assert_eq!(comparison.requests, 1);
    }

    #[test]
    fn bucket_start_aligns_to_local_boundaries() {
        let time = 1_784_500_123_456i64;

        let minute = bucket_start(time, Granularity::Minute);
        assert!(minute <= time && time - minute < 60_000);
        assert_eq!(minute % 60_000, 0);

        let hour = bucket_start(time, Granularity::Hour);
        let hour_local = Local.timestamp_millis_opt(hour).single().expect("hour");
        assert_eq!(hour_local.minute(), 0);
        assert_eq!(hour_local.second(), 0);
        assert!(hour <= time && time - hour < 3_600_000);

        let day = bucket_start(time, Granularity::Day);
        let day_local = Local.timestamp_millis_opt(day).single().expect("day");
        assert_eq!(day_local.format("%H:%M:%S").to_string(), "00:00:00");
        assert!(day <= time && time - day < 2 * 86_400_000);

        let week = bucket_start(time, Granularity::Week);
        let week_local = Local.timestamp_millis_opt(week).single().expect("week");
        assert_eq!(week_local.weekday(), chrono::Weekday::Mon);
        assert_eq!(week_local.format("%H:%M:%S").to_string(), "00:00:00");
        assert!(week <= time && time - week < 8 * 86_400_000);

        let month = bucket_start(time, Granularity::Month);
        let month_local = Local.timestamp_millis_opt(month).single().expect("month");
        assert_eq!(month_local.day(), 1);
        assert_eq!(month_local.format("%H:%M:%S").to_string(), "00:00:00");
        assert!(month <= time && time - month < 32 * 86_400_000);

        for granularity in [
            Granularity::Minute,
            Granularity::Hour,
            Granularity::Day,
            Granularity::Week,
            Granularity::Month,
        ] {
            let bucket = bucket_start(time, granularity);
            assert_eq!(bucket_start(bucket, granularity), bucket);
        }
    }

    #[test]
    fn auto_granularity_selects_by_span() {
        const HOUR: i64 = 3_600_000;
        const DAY: i64 = 86_400_000;
        assert_eq!(auto_granularity(0), Granularity::Minute);
        assert_eq!(auto_granularity(6 * HOUR), Granularity::Minute);
        assert_eq!(auto_granularity(6 * HOUR + 1), Granularity::Hour);
        assert_eq!(auto_granularity(72 * HOUR), Granularity::Hour);
        assert_eq!(auto_granularity(72 * HOUR + 1), Granularity::Day);
        assert_eq!(auto_granularity(120 * DAY), Granularity::Day);
        assert_eq!(auto_granularity(120 * DAY + 1), Granularity::Week);
        assert_eq!(auto_granularity(730 * DAY), Granularity::Week);
        assert_eq!(auto_granularity(730 * DAY + 1), Granularity::Month);
    }

    #[test]
    fn auto_granularity_is_reported_from_filter_span() {
        let temporary = tempfile::tempdir().expect("temporary directory");
        let base = 1_784_500_000_000i64;
        write_records(
            temporary.path(),
            "session-1",
            &[("kimi-k3", base, Some("turn"), [100, 20, 80, 0])],
        );

        let report = scan(
            temporary.path().to_str(),
            Some(ScanFilter {
                start_ms: Some(base - 7_200_000),
                end_ms: Some(base),
                ..ScanFilter::default()
            }),
        )
        .expect("usage report");
        assert_eq!(report.granularity, "minute");

        let report = scan(
            temporary.path().to_str(),
            Some(ScanFilter {
                start_ms: Some(base - 10 * 86_400_000),
                end_ms: Some(base),
                ..ScanFilter::default()
            }),
        )
        .expect("usage report");
        assert_eq!(report.granularity, "day");
    }

    #[test]
    fn series_buckets_follow_requested_granularity() {
        let temporary = tempfile::tempdir().expect("temporary directory");
        let hour_start = bucket_start(1_784_500_000_000, Granularity::Hour);
        write_records(
            temporary.path(),
            "session-1",
            &[
                ("kimi-k3", hour_start, Some("turn"), [100, 20, 80, 0]),
                (
                    "kimi-k3",
                    hour_start + 60_000,
                    Some("turn"),
                    [100, 20, 80, 0],
                ),
            ],
        );
        let home = temporary.path().to_str();

        let scan_with = |granularity: &str| {
            scan(
                home,
                Some(ScanFilter {
                    granularity: granularity.to_string(),
                    ..ScanFilter::default()
                }),
            )
            .expect("usage report")
        };

        let report = scan_with("minute");
        assert_eq!(report.granularity, "minute");
        assert_eq!(report.series.len(), 2);
        assert!(report.series[0].start_ms < report.series[1].start_ms);

        let report = scan_with("hour");
        assert_eq!(report.series.len(), 1);
        assert_eq!(report.series[0].start_ms, hour_start);
        assert_eq!(report.series[0].requests, 2);

        let report = scan_with("day");
        assert_eq!(report.series.len(), 1);
        assert_eq!(
            report.series[0].start_ms,
            bucket_start(hour_start, Granularity::Day)
        );

        let report = scan_with("week");
        assert_eq!(report.series.len(), 1);
        let week_local = Local
            .timestamp_millis_opt(report.series[0].start_ms)
            .single()
            .expect("week bucket");
        assert_eq!(week_local.weekday(), chrono::Weekday::Mon);

        let report = scan_with("month");
        assert_eq!(report.series.len(), 1);
        let month_local = Local
            .timestamp_millis_opt(report.series[0].start_ms)
            .single()
            .expect("month bucket");
        assert_eq!(month_local.day(), 1);
    }

    #[test]
    fn series_granularity_upgrades_when_buckets_exceed_cap() {
        let mut state = ScanState::default();
        let usage = RawTokenUsage {
            input_other: 1,
            output: 0,
            input_cache_read: 0,
            input_cache_creation: 0,
        };
        let total = MAX_SERIES_BUCKETS as i64 + 10;
        for index in 0..total {
            insert_series_bucket(&mut state, 1_784_500_000_000 + index * 60_000, &usage, None);
        }
        assert_eq!(state.series_granularity, Granularity::Hour);
        assert!(state.series.len() <= MAX_SERIES_BUCKETS);
        assert_eq!(
            state
                .series
                .values()
                .map(|aggregate| aggregate.requests)
                .sum::<u64>(),
            total as u64
        );
    }

    #[test]
    fn comparison_summarizes_previous_window_only() {
        let temporary = tempfile::tempdir().expect("temporary directory");
        let start = 1_784_500_001_000i64;
        let end = start + 999;
        write_records(
            temporary.path(),
            "session-1",
            &[
                ("kimi-k3", start, Some("turn"), [100, 20, 80, 0]),
                ("kimi-k3", start - 1, Some("turn"), [200, 40, 160, 0]),
                ("kimi-k3", start - 1_001, Some("turn"), [400, 0, 0, 0]),
            ],
        );

        let report = scan(
            temporary.path().to_str(),
            Some(ScanFilter {
                start_ms: Some(start),
                end_ms: Some(end),
                ..ScanFilter::default()
            }),
        )
        .expect("usage report");

        assert_eq!(report.requests, 1);
        assert_eq!(report.tokens.input_other, 100);
        assert_eq!(report.recent.len(), 1);
        assert_eq!(
            report
                .dimensions
                .models
                .iter()
                .map(|value| value.requests)
                .sum::<u64>(),
            1
        );

        let comparison = report.comparison.expect("comparison summary");
        assert_eq!(comparison.requests, 1);
        assert_eq!(comparison.sessions, 1);
        assert_eq!(comparison.tokens.input_other, 200);
        assert_eq!(comparison.tokens.input_cache_read, 160);
        assert!((comparison.cache_hit_rate - 160.0 / 360.0).abs() < 1e-9);
        let expected_cost = pricing::format_cny_nanos(
            pricing::find("kimi-k3")
                .expect("k3 pricing")
                .calculate_nanos(200, 40, 160, 0),
        );
        assert_eq!(comparison.priced_cost_cny, expected_cost);
    }

    #[test]
    fn billing_filter_selects_priced_or_unpriced() {
        let temporary = tempfile::tempdir().expect("temporary directory");
        write_records(
            temporary.path(),
            "session-1",
            &[
                ("kimi-k3", 1_784_500_000_000, Some("turn"), [100, 20, 80, 0]),
                (
                    "kimi-for-coding",
                    1_784_500_000_000,
                    Some("turn"),
                    [100, 20, 80, 0],
                ),
            ],
        );
        let home = temporary.path().to_str();

        let report = scan(
            home,
            Some(ScanFilter {
                billing: "priced".to_string(),
                ..ScanFilter::default()
            }),
        )
        .expect("usage report");
        assert_eq!(report.requests, 1);
        assert_eq!(report.models.len(), 1);
        assert_eq!(report.models[0].model, "kimi-k3");

        let report = scan(
            home,
            Some(ScanFilter {
                billing: "unpriced".to_string(),
                ..ScanFilter::default()
            }),
        )
        .expect("usage report");
        assert_eq!(report.requests, 1);
        assert_eq!(report.unpriced_requests, 1);
        assert_eq!(report.models.len(), 1);
        assert_eq!(report.models[0].model, "kimi-for-coding");
    }

    #[test]
    fn scopes_filter_and_group_unspecified_scope() {
        let temporary = tempfile::tempdir().expect("temporary directory");
        write_records(
            temporary.path(),
            "session-1",
            &[
                ("kimi-k3", 1_784_500_000_000, Some("turn"), [100, 20, 80, 0]),
                ("kimi-k3", 1_784_500_000_001, None, [100, 20, 80, 0]),
            ],
        );
        let home = temporary.path().to_str();

        let report = scan(home, None).expect("usage report");
        assert_eq!(report.requests, 2);
        let scopes = report
            .dimensions
            .scopes
            .iter()
            .map(|value| value.value.as_str())
            .collect::<Vec<_>>();
        assert!(scopes.contains(&"turn"));
        assert!(scopes.contains(&UNSPECIFIED_SCOPE));
        let unscoped = report
            .recent
            .iter()
            .find(|record| record.scope == UNSPECIFIED_SCOPE)
            .expect("unscoped recent record");
        assert_eq!(unscoped.time, 1_784_500_000_001);

        let report = scan(
            home,
            Some(ScanFilter {
                scopes: vec!["turn".to_string()],
                ..ScanFilter::default()
            }),
        )
        .expect("usage report");
        assert_eq!(report.requests, 1);
        assert_eq!(report.recent[0].scope, "turn");
    }

    #[test]
    fn dimensions_cover_models_beyond_the_model_whitelist() {
        let temporary = tempfile::tempdir().expect("temporary directory");
        write_records(
            temporary.path(),
            "session-1",
            &[
                ("kimi-k3", 1_784_500_000_000, Some("turn"), [100, 20, 80, 0]),
                (
                    "custom-model-x",
                    1_784_500_000_001,
                    Some("turn"),
                    [100, 20, 80, 0],
                ),
            ],
        );

        let report = scan(
            temporary.path().to_str(),
            Some(ScanFilter {
                models: vec!["kimi-k3".to_string()],
                ..ScanFilter::default()
            }),
        )
        .expect("usage report");
        assert_eq!(report.requests, 1);
        assert_eq!(report.models.len(), 1);
        assert_eq!(report.models[0].model, "kimi-k3");

        let dimension_models = report
            .dimensions
            .models
            .iter()
            .map(|value| (value.value.as_str(), value.requests))
            .collect::<Vec<_>>();
        assert!(dimension_models.contains(&("kimi-k3", 1)));
        assert!(dimension_models.contains(&("custom-model-x", 1)));
    }
}
