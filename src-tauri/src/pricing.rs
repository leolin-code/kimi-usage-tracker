use serde::Serialize;

const NANOS_PER_CNY: i128 = 1_000_000_000;
const TOKENS_PER_PRICE_UNIT: i128 = 1_000_000;

#[derive(Debug, Clone, Copy)]
pub struct OfficialPricing {
    pub input_nanos: i128,
    pub output_nanos: i128,
    pub cache_read_nanos: i128,
    pub cache_creation_nanos: i128,
    pub context_tokens: u64,
    pub source_url: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PricingMetadata {
    pub model: String,
    pub input_cny_per_million: String,
    pub output_cny_per_million: String,
    pub cache_read_cny_per_million: String,
    pub context_tokens: u64,
    pub source_url: String,
    pub verified_on: String,
}

impl OfficialPricing {
    pub fn calculate_nanos(
        self,
        input_other: u64,
        output: u64,
        cache_read: u64,
        cache_creation: u64,
    ) -> i128 {
        let weighted = i128::from(input_other) * self.input_nanos
            + i128::from(output) * self.output_nanos
            + i128::from(cache_read) * self.cache_read_nanos
            + i128::from(cache_creation) * self.cache_creation_nanos;
        weighted / TOKENS_PER_PRICE_UNIT
    }
}

pub fn find(model: &str) -> Option<OfficialPricing> {
    match canonical_model(model)? {
        "kimi-k3" => Some(OfficialPricing {
            input_nanos: cny_cents(2_000),
            output_nanos: cny_cents(10_000),
            cache_read_nanos: cny_cents(200),
            cache_creation_nanos: cny_cents(2_000),
            context_tokens: 1_048_576,
            source_url: "https://platform.kimi.com/docs/pricing/chat-k3",
        }),
        "kimi-k2.7-code" => Some(OfficialPricing {
            input_nanos: cny_cents(650),
            output_nanos: cny_cents(2_700),
            cache_read_nanos: cny_cents(130),
            cache_creation_nanos: cny_cents(650),
            context_tokens: 262_144,
            source_url: "https://platform.kimi.com/docs/pricing/chat-k27-code",
        }),
        "kimi-k2.7-code-highspeed" => Some(OfficialPricing {
            input_nanos: cny_cents(1_300),
            output_nanos: cny_cents(5_400),
            cache_read_nanos: cny_cents(260),
            cache_creation_nanos: cny_cents(1_300),
            context_tokens: 262_144,
            source_url: "https://platform.kimi.com/docs/pricing/chat-k27-code",
        }),
        "kimi-k2.6" => Some(OfficialPricing {
            input_nanos: cny_cents(650),
            output_nanos: cny_cents(2_700),
            cache_read_nanos: cny_cents(110),
            cache_creation_nanos: cny_cents(650),
            context_tokens: 262_144,
            source_url: "https://platform.kimi.com/docs/pricing/chat-k26",
        }),
        "kimi-k2.5" => Some(OfficialPricing {
            input_nanos: cny_cents(400),
            output_nanos: cny_cents(2_100),
            cache_read_nanos: cny_cents(70),
            cache_creation_nanos: cny_cents(400),
            context_tokens: 262_144,
            source_url: "https://platform.kimi.com/docs/pricing/chat-k25",
        }),
        "moonshot-v1-8k" | "moonshot-v1-8k-vision-preview" => Some(OfficialPricing {
            input_nanos: cny_cents(200),
            output_nanos: cny_cents(1_000),
            cache_read_nanos: cny_cents(200),
            cache_creation_nanos: cny_cents(200),
            context_tokens: 8_192,
            source_url: "https://platform.kimi.com/docs/pricing/chat-v1",
        }),
        "moonshot-v1-32k" | "moonshot-v1-32k-vision-preview" => Some(OfficialPricing {
            input_nanos: cny_cents(500),
            output_nanos: cny_cents(2_000),
            cache_read_nanos: cny_cents(500),
            cache_creation_nanos: cny_cents(500),
            context_tokens: 32_768,
            source_url: "https://platform.kimi.com/docs/pricing/chat-v1",
        }),
        "moonshot-v1-128k" | "moonshot-v1-128k-vision-preview" => Some(OfficialPricing {
            input_nanos: cny_cents(1_000),
            output_nanos: cny_cents(3_000),
            cache_read_nanos: cny_cents(1_000),
            cache_creation_nanos: cny_cents(1_000),
            context_tokens: 131_072,
            source_url: "https://platform.kimi.com/docs/pricing/chat-v1",
        }),
        _ => unreachable!("canonical_model returned an unsupported model"),
    }
}

pub fn metadata(model: &str) -> Option<PricingMetadata> {
    let price = find(model)?;
    let canonical = canonical_model(model)?;
    Some(PricingMetadata {
        model: canonical.to_string(),
        input_cny_per_million: format_rate(price.input_nanos),
        output_cny_per_million: format_rate(price.output_nanos),
        cache_read_cny_per_million: format_rate(price.cache_read_nanos),
        context_tokens: price.context_tokens,
        source_url: price.source_url.to_string(),
        verified_on: "2026-07-20".to_string(),
    })
}

pub fn format_cny_nanos(value: i128) -> String {
    let value = value.max(0);
    let whole = value / NANOS_PER_CNY;
    let fraction = (value % NANOS_PER_CNY) / 1_000;
    format!("{whole}.{fraction:06}")
}

fn format_rate(value: i128) -> String {
    let whole = value / NANOS_PER_CNY;
    let fraction = (value % NANOS_PER_CNY) / 10_000_000;
    if fraction == 0 {
        whole.to_string()
    } else {
        format!("{whole}.{fraction:02}")
            .trim_end_matches('0')
            .to_string()
    }
}

pub fn canonical_model(model: &str) -> Option<&'static str> {
    let normalized = model
        .rsplit('/')
        .next()
        .unwrap_or(model)
        .split(':')
        .next()
        .unwrap_or(model)
        .trim()
        .to_ascii_lowercase()
        .replace('_', "-");
    match normalized.as_str() {
        "k3" | "kimi3" | "kimi-k3" => Some("kimi-k3"),
        "k2.7-code" | "k2-7-code" | "kimi-k2-7-code" | "kimi-k2.7-code" => Some("kimi-k2.7-code"),
        "k2.7-code-highspeed"
        | "k2.7-code-high-speed"
        | "k2-7-code-highspeed"
        | "k2-7-code-high-speed"
        | "kimi-k2-7-code-highspeed"
        | "kimi-k2-7-code-high-speed"
        | "kimi-k2.7-code-high-speed"
        | "kimi-k2.7-code-highspeed" => Some("kimi-k2.7-code-highspeed"),
        "k2.6" | "k2-6" | "kimi-k2-6" | "kimi-k2.6" => Some("kimi-k2.6"),
        "k2.5" | "k2-5" | "kimi-k2-5" | "kimi-k2.5" => Some("kimi-k2.5"),
        "moonshot-v1-8k" => Some("moonshot-v1-8k"),
        "moonshot-v1-32k" => Some("moonshot-v1-32k"),
        "moonshot-v1-128k" => Some("moonshot-v1-128k"),
        "moonshot-v1-8k-vision-preview" => Some("moonshot-v1-8k-vision-preview"),
        "moonshot-v1-32k-vision-preview" => Some("moonshot-v1-32k-vision-preview"),
        "moonshot-v1-128k-vision-preview" => Some("moonshot-v1-128k-vision-preview"),
        _ => None,
    }
}

const fn cny_cents(value: i128) -> i128 {
    value * (NANOS_PER_CNY / 100)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn managed_kimi_code_has_no_fake_token_price() {
        assert!(find("kimi-for-coding").is_none());
    }

    #[test]
    fn calculates_k3_components_from_official_rates() {
        let pricing = find("moonshot/kimi-k3").expect("K3 pricing");
        let nanos = pricing.calculate_nanos(1_000_000, 1_000_000, 1_000_000, 0);
        assert_eq!(format_cny_nanos(nanos), "122.000000");
        assert_eq!(pricing.context_tokens, 1_048_576);
    }

    #[test]
    fn includes_current_public_platform_models() {
        for model in [
            "kimi-k3",
            "kimi-k2.7-code",
            "kimi-k2.7-code-highspeed",
            "kimi-k2.6",
            "kimi-k2.5",
            "moonshot-v1-8k",
            "moonshot-v1-32k",
            "moonshot-v1-128k",
        ] {
            assert!(find(model).is_some(), "missing official price for {model}");
        }
    }

    #[test]
    fn resolves_common_cli_and_environment_model_aliases() {
        assert_eq!(canonical_model("k3"), Some("kimi-k3"));
        assert_eq!(canonical_model("KIMI/K2_7_CODE"), Some("kimi-k2.7-code"));
        assert_eq!(canonical_model("kimi-k2-6:latest"), Some("kimi-k2.6"));
        assert_eq!(
            canonical_model("k2.7-code-high-speed"),
            Some("kimi-k2.7-code-highspeed")
        );
    }
}
