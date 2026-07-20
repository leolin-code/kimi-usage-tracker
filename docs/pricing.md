# Built-in Kimi Pricing

Verified against the official Chinese Kimi API Platform documentation on 2026-07-20.

Prices are CNY per 1,000,000 tokens. “Cache read” corresponds to the official “input price (cache hit)”. Cache creation is charged at the uncached input rate if a compatible provider reports it separately.

| Model                      | Cache read | Uncached input |  Output |   Context | Official source                                                                |
| -------------------------- | ---------: | -------------: | ------: | --------: | ------------------------------------------------------------------------------ |
| `kimi-k3`                  |      ¥2.00 |         ¥20.00 | ¥100.00 | 1,048,576 | [Kimi K3 pricing](https://platform.kimi.com/docs/pricing/chat-k3)              |
| `kimi-k2.7-code`           |      ¥1.30 |          ¥6.50 |  ¥27.00 |   262,144 | [Kimi K2.7 Code pricing](https://platform.kimi.com/docs/pricing/chat-k27-code) |
| `kimi-k2.7-code-highspeed` |      ¥2.60 |         ¥13.00 |  ¥54.00 |   262,144 | [Kimi K2.7 Code pricing](https://platform.kimi.com/docs/pricing/chat-k27-code) |
| `kimi-k2.6`                |      ¥1.10 |          ¥6.50 |  ¥27.00 |   262,144 | [Kimi K2.6 pricing](https://platform.kimi.com/docs/pricing/chat-k26)           |
| `kimi-k2.5`                |      ¥0.70 |          ¥4.00 |  ¥21.00 |   262,144 | [Kimi K2.5 pricing](https://platform.kimi.com/docs/pricing/chat-k25)           |
| `moonshot-v1-8k`           |      ¥2.00 |          ¥2.00 |  ¥10.00 |     8,192 | [Moonshot V1 pricing](https://platform.kimi.com/docs/pricing/chat-v1)          |
| `moonshot-v1-32k`          |      ¥5.00 |          ¥5.00 |  ¥20.00 |    32,768 | [Moonshot V1 pricing](https://platform.kimi.com/docs/pricing/chat-v1)          |
| `moonshot-v1-128k`         |     ¥10.00 |         ¥10.00 |  ¥30.00 |   131,072 | [Moonshot V1 pricing](https://platform.kimi.com/docs/pricing/chat-v1)          |

The three `moonshot-v1-*-vision-preview` IDs use the same prices and context limits as their corresponding text model.

## Model aliases

Pricing is applied after model normalization. Common Kimi Code values such as `k3`, `k2.7-code`, and provider-prefixed variants resolve to their canonical official IDs. Custom aliases are resolved from `[models."<alias>"].model` in the selected Kimi Code home `config.toml`; the app does not use or display provider credentials.

`KIMI_MODEL_NAME` creates a temporary runtime model and is not persisted by Kimi Code. Kimi Code writes the reserved `__kimi_env_model__` alias into `usage.record` and records the safe actual-model mapping in the session log. The tracker joins those two sources by session and timestamp, allowing the internal alias to merge into its canonical model without reading API keys.

## Kimi Code Subscription Usage

`kimi-for-coding` intentionally has no built-in token price. Kimi’s official product comparison states that Kimi API Platform is pay-as-you-go while Kimi Code membership benefits are a separate product. Applying a K2.x or K3 public API price to `kimi-for-coding` would therefore misrepresent actual charges.

Official product distinction: [Kimi product plans](https://platform.kimi.com/docs/guide/product-plans)

## Calculation

```text
estimated cost =
  uncached input tokens × uncached input price
  + cache-read tokens × cache-read price
  + cache-creation tokens × uncached input price
  + output tokens × output price
```

The implementation uses integer nano-CNY arithmetic and divides once by 1,000,000, avoiding floating-point accumulation.
