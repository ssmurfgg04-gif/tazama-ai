//! Rust-side provider AI calls (Task 5).
//!
//! All provider keys come ONLY from the OS keyring via
//! [`crate::secrets::read_key`] â€” never from JS arguments, never logged.
//! Transport/API failures map to `"could not reach <provider>: ..."` and
//! never include key material or full response bodies.
//!
//! Test note (R13): no `tauri::test::mock_builder()` anywhere (it crashes the
//! loader on this host â€” see `secrets.rs` module docs). Unit tests cover the
//! pure builders/mappers, and async tests drive the `*_with_base` helpers
//! against a local `wiremock` server with the same headers/bodies the
//! commands send to production.

use serde::Deserialize;
use tauri::{AppHandle, Runtime, State};

use crate::secrets::read_key;
use crate::AppState;

/// A single chat message (frontend shape).
#[derive(Debug, Clone, Deserialize)]
pub(crate) struct ChatMsg {
    pub role: String,
    pub content: String,
}

/// Provider base URLs (verbatim per brief).
pub const ANTHROPIC_BASE: &str = "https://api.anthropic.com";
pub const OPENAI_BASE: &str = "https://api.openai.com";
pub const GROQ_BASE: &str = "https://api.groq.com/openai";
pub const NVIDIA_BASE: &str = "https://integrate.api.nvidia.com";
pub const FISH_BASE: &str = "https://api.fish.audio";

/// Resolve a provider name to its API base URL.
pub(crate) fn base_for(provider: &str) -> Result<&'static str, String> {
    match provider {
        "anthropic" => Ok(ANTHROPIC_BASE),
        "openai" => Ok(OPENAI_BASE),
        "groq" => Ok(GROQ_BASE),
        "nvidia" => Ok(NVIDIA_BASE),
        "fish" => Ok(FISH_BASE),
        other => Err(format!("unknown provider `{other}`")),
    }
}

/// Anthropic `/v1/messages` body: `model`, `max_tokens: 1024`,
/// `messages: [{role, content}]`. Pure (no network, no key).
pub(crate) fn anthropic_body(model: &str, messages: &[(String, String)]) -> serde_json::Value {
    serde_json::json!({
        "model": model,
        "max_tokens": 1024,
        "messages": messages
            .iter()
            .map(|(role, content)| serde_json::json!({ "role": role, "content": content }))
            .collect::<Vec<_>>(),
    })
}

/// OpenAI-compatible `/v1/chat/completions` body: `model`, `messages`.
/// Pure (no network, no key).
pub(crate) fn openai_body(model: &str, messages: &[(String, String)]) -> serde_json::Value {
    serde_json::json!({
        "model": model,
        "messages": messages
            .iter()
            .map(|(role, content)| serde_json::json!({ "role": role, "content": content }))
            .collect::<Vec<_>>(),
    })
}

fn pairs_of(messages: &[ChatMsg]) -> Vec<(String, String)> {
    messages
        .iter()
        .map(|m| (m.role.clone(), m.content.clone()))
        .collect()
}

/// Wrap a failure as `could not reach <provider>: <one-line reason>`.
/// Key-free by construction: the key only travels in request headers, which
/// are never formatted into errors, and full bodies are never included.
fn short_reason(provider: &str, detail: impl std::fmt::Display) -> String {
    let first = detail.to_string();
    let first = first.lines().next().unwrap_or("").trim();
    let short: String = first.chars().take(160).collect();
    format!("could not reach {provider}: {short}")
}

/// Extract assistant text from an Anthropic `/v1/messages` response
/// (`content[0].text`).
pub(crate) fn extract_anthropic_text(
    provider: &str,
    body: &serde_json::Value,
) -> Result<String, String> {
    body.pointer("/content/0/text")
        .and_then(|v| v.as_str())
        .map(str::to_owned)
        .ok_or_else(|| short_reason(provider, "bad anthropic response shape"))
}

/// Extract assistant text from an OpenAI-compatible response
/// (`choices[0].message.content`).
pub(crate) fn extract_openai_text(
    provider: &str,
    body: &serde_json::Value,
) -> Result<String, String> {
    body.pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .map(str::to_owned)
        .ok_or_else(|| short_reason(provider, "bad openai response shape"))
}

/// Map an HTTP status from a cheap `key_test` probe: 2xx -> `Ok(true)`,
/// 401/403 -> `Ok(false)`, anything else -> transport-style `Err`.
pub(crate) fn map_key_test(provider: &str, status: u16) -> Result<bool, String> {
    if (200..300).contains(&status) {
        Ok(true)
    } else if status == 401 || status == 403 {
        Ok(false)
    } else {
        Err(format!("could not reach {provider}: http {status}"))
    }
}

/// Shared `reqwest` client: lock `AppState.http`, build once if `None`.
fn http_client(state: &State<'_, AppState>) -> Result<reqwest::Client, String> {
    let mut guard = state
        .http
        .lock()
        .map_err(|e| format!("http client unavailable: {e}"))?;
    if guard.is_none() {
        *guard = Some(
            reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .map_err(|e| format!("http client build failed: {e}"))?,
        );
    }
    Ok(guard.clone().expect("client just built"))
}

async fn check_status(
    provider: &str,
    resp: reqwest::Response,
) -> Result<reqwest::Response, String> {
    let status = resp.status();
    if status.is_success() {
        Ok(resp)
    } else {
        Err(format!(
            "could not reach {provider}: http {}",
            status.as_u16()
        ))
    }
}

async fn read_json(
    provider: &str,
    resp: reqwest::Response,
) -> Result<serde_json::Value, String> {
    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| short_reason(provider, e))
}

fn encode_b64(bytes: &[u8]) -> String {
    use base64::Engine as _;
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

/// Anthropic chat against an explicit base (commands pass the production
/// base; tests pass the wiremock URL). Sends `x-api-key` +
/// `anthropic-version: 2023-06-01`.
pub(crate) async fn anthropic_chat_with_base(
    client: &reqwest::Client,
    base: &str,
    key: &str,
    provider: &str,
    model: &str,
    messages: &[(String, String)],
) -> Result<String, String> {
    let resp = client
        .post(format!("{base}/v1/messages"))
        .header("x-api-key", key)
        .header("anthropic-version", "2023-06-01")
        .json(&anthropic_body(model, messages))
        .send()
        .await
        .map_err(|e| short_reason(provider, e))?;
    let resp = check_status(provider, resp).await?;
    extract_anthropic_text(provider, &read_json(provider, resp).await?)
}

/// OpenAI-compatible chat against an explicit base (`Authorization: Bearer`).
/// Covers OpenAI, Groq, and NVIDIA (all OpenAI-shape).
#[allow(clippy::too_many_arguments)]
pub(crate) async fn openai_chat_with_base(
    client: &reqwest::Client,
    base: &str,
    key: &str,
    provider: &str,
    model: &str,
    messages: &[(String, String)],
) -> Result<String, String> {
    let resp = client
        .post(format!("{base}/v1/chat/completions"))
        .bearer_auth(key)
        .json(&openai_body(model, messages))
        .send()
        .await
        .map_err(|e| short_reason(provider, e))?;
    let resp = check_status(provider, resp).await?;
    extract_openai_text(provider, &read_json(provider, resp).await?)
}

/// Fish Audio speech against an explicit base: POST `{base}/v1/tts` with
/// Bearer auth. Returns raw audio bytes (commands base64-encode them).
pub(crate) async fn fish_speak_with_base(
    client: &reqwest::Client,
    base: &str,
    key: &str,
    provider: &str,
    text: &str,
) -> Result<Vec<u8>, String> {
    let resp = client
        .post(format!("{base}/v1/tts"))
        .bearer_auth(key)
        .json(&serde_json::json!({ "text": text, "format": "mp3" }))
        .send()
        .await
        .map_err(|e| short_reason(provider, e))?;
    let resp = check_status(provider, resp).await?;
    resp.bytes()
        .await
        .map(|b| b.to_vec())
        .map_err(|e| short_reason(provider, e))
}

/// Cheap per-provider key probe against an explicit base: models-list GET
/// where available (Anthropic `/v1/models` with its key headers, everyone
/// else `/v1/models` with Bearer). Maps via [`map_key_test`].
pub(crate) async fn key_probe_with_base(
    client: &reqwest::Client,
    base: &str,
    key: &str,
    provider: &str,
) -> Result<bool, String> {
    let req = client.get(format!("{base}/v1/models"));
    let req = if provider == "anthropic" {
        req.header("x-api-key", key)
            .header("anthropic-version", "2023-06-01")
    } else {
        req.bearer_auth(key)
    };
    let resp = req
        .send()
        .await
        .map_err(|e| short_reason(provider, e))?;
    map_key_test(provider, resp.status().as_u16())
}

/// Chat completion. The key is read ONLY from the OS keyring via `read_key`
/// (never from JS args). Anthropic -> `/v1/messages`; OpenAI/Groq/NVIDIA ->
/// OpenAI-compatible `/v1/chat/completions`; Fish Audio has no chat endpoint
/// so the conversation text is sent to its speak endpoint and base64 audio is
/// returned.
#[tauri::command]
pub async fn chat_complete<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    provider: String,
    model: String,
    messages: Vec<ChatMsg>,
) -> Result<String, String> {
    let key = read_key(&app, &provider)?;
    let base = base_for(&provider)?;
    let client = http_client(&state)?;
    let pairs = pairs_of(&messages);
    if provider == "anthropic" {
        anthropic_chat_with_base(&client, base, &key, &provider, &model, &pairs).await
    } else if provider == "fish" {
        let text = pairs
            .iter()
            .map(|(_, content)| content.as_str())
            .collect::<Vec<_>>()
            .join("\n");
        let bytes = fish_speak_with_base(&client, base, &key, &provider, &text).await?;
        Ok(encode_b64(&bytes))
    } else {
        openai_chat_with_base(&client, base, &key, &provider, &model, &pairs).await
    }
}

/// Key check: `Ok(true)` on 200, `Ok(false)` on 401/403, `Err` on transport
/// failure. Uses the cheapest models-list GET per provider.
#[tauri::command]
pub async fn key_test<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    provider: String,
) -> Result<bool, String> {
    let key = read_key(&app, &provider)?;
    let base = base_for(&provider)?;
    let client = http_client(&state)?;
    key_probe_with_base(&client, base, &key, &provider).await
}

/// Speech-to-text (thin slice; full voice UX is Plan D). Fish Audio ASR for
/// `fish`, Whisper-compatible transcription otherwise. Audio travels as raw
/// bytes from the frontend; the thin JSON transport below is replaced with
/// multipart fidelity in Plan D.
#[tauri::command]
pub async fn transcribe<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    provider: String,
    model: String,
    audio: Vec<u8>,
) -> Result<String, String> {
    let key = read_key(&app, &provider)?;
    let base = base_for(&provider)?;
    let client = http_client(&state)?;
    let payload = serde_json::json!({ "model": model, "audio": encode_b64(&audio) });
    let url = if provider == "fish" {
        format!("{base}/v1/asr")
    } else if provider == "anthropic" {
        return Err(format!("transcribe: unsupported provider `{provider}`"));
    } else {
        format!("{base}/v1/audio/transcriptions")
    };
    let resp = client
        .post(url)
        .bearer_auth(&key)
        .json(&payload)
        .send()
        .await
        .map_err(|e| short_reason(&provider, e))?;
    let resp = check_status(&provider, resp).await?;
    let body = read_json(&provider, resp).await?;
    body.pointer("/text")
        .and_then(|v| v.as_str())
        .map(str::to_owned)
        .ok_or_else(|| short_reason(&provider, "bad transcription response shape"))
}

/// Text-to-speech (thin slice; full voice UX is Plan D). Returns base64 MP3.
/// Fish Audio speak endpoint for `fish`, OpenAI TTS for `openai`.
#[tauri::command]
pub async fn speak<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    provider: String,
    text: String,
    voice: Option<String>,
) -> Result<String, String> {
    let key = read_key(&app, &provider)?;
    let base = base_for(&provider)?;
    let client = http_client(&state)?;
    if provider == "fish" {
        let bytes = fish_speak_with_base(&client, base, &key, &provider, &text).await?;
        Ok(encode_b64(&bytes))
    } else if provider == "openai" {
        let resp = client
            .post(format!("{base}/v1/audio/speech"))
            .bearer_auth(&key)
            .json(&serde_json::json!({
                "model": "tts-1",
                "input": text,
                "voice": voice.unwrap_or_else(|| "alloy".to_owned()),
                "response_format": "mp3",
            }))
            .send()
            .await
            .map_err(|e| short_reason(&provider, e))?;
        let resp = check_status(&provider, resp).await?;
        let bytes = resp
            .bytes()
            .await
            .map_err(|e| short_reason(&provider, e))?;
        Ok(encode_b64(&bytes))
    } else {
        Err(format!("speak: unsupported provider `{provider}`"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{body_partial_json, header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    const SENTINEL_KEY: &str = "sk-test-SENTINEL-abc123";

    fn sample_pairs() -> Vec<(String, String)> {
        vec![
            ("user".to_owned(), "hello".to_owned()),
            ("assistant".to_owned(), "hi there".to_owned()),
        ]
    }

    #[test]
    fn anthropic_body_shape_has_no_key() {
        let body = anthropic_body("claude-x", &sample_pairs());
        assert_eq!(body["model"], "claude-x");
        assert_eq!(body["max_tokens"], 1024);
        assert_eq!(body["messages"].as_array().unwrap().len(), 2);
        assert_eq!(body["messages"][0]["role"], "user");
        assert_eq!(body["messages"][0]["content"], "hello");
        assert_eq!(body["messages"][1]["role"], "assistant");
        // No key material anywhere in the body.
        assert!(body.get("x-api-key").is_none());
        assert!(body.get("authorization").is_none());
        assert!(!serde_json::to_string(&body).unwrap().contains("sk-test"));
    }

    #[test]
    fn openai_body_shape_has_no_key() {
        let body = openai_body("gpt-x", &sample_pairs());
        assert_eq!(body["model"], "gpt-x");
        assert_eq!(body["messages"].as_array().unwrap().len(), 2);
        assert_eq!(body["messages"][1]["content"], "hi there");
        assert!(body.get("max_tokens").is_none());
        assert!(!serde_json::to_string(&body).unwrap().contains("sk-test"));
    }

    #[test]
    fn base_for_known_and_unknown() {
        assert_eq!(base_for("anthropic").unwrap(), ANTHROPIC_BASE);
        assert_eq!(base_for("openai").unwrap(), OPENAI_BASE);
        assert_eq!(base_for("groq").unwrap(), GROQ_BASE);
        assert_eq!(base_for("nvidia").unwrap(), NVIDIA_BASE);
        assert_eq!(base_for("fish").unwrap(), FISH_BASE);
        assert!(base_for("unknown-provider").is_err());
    }

    #[test]
    fn extract_and_key_test_mapping_never_leaks_key() {
        // Happy paths.
        let a = serde_json::json!({ "content": [{ "type": "text", "text": "A" }] });
        assert_eq!(extract_anthropic_text("anthropic", &a).unwrap(), "A");
        let o =
            serde_json::json!({ "choices": [{ "message": { "content": "B" } }] });
        assert_eq!(extract_openai_text("openai", &o).unwrap(), "B");
        // Key-test status mapping.
        assert_eq!(map_key_test("openai", 200).unwrap(), true);
        assert_eq!(map_key_test("openai", 401).unwrap(), false);
        assert_eq!(map_key_test("openai", 403).unwrap(), false);
        // Error paths name the provider, carry the status, never the key.
        let err = map_key_test("groq", 500).unwrap_err();
        assert!(err.contains("groq"), "must name provider: {err}");
        assert!(err.contains("could not reach"), "must use reach prefix: {err}");
        assert!(!err.contains(SENTINEL_KEY));
        let err = extract_anthropic_text("anthropic", &serde_json::json!({})).unwrap_err();
        assert!(err.contains("could not reach anthropic"));
        let err = extract_openai_text("nvidia", &serde_json::json!({"choices": []})).unwrap_err();
        assert!(err.contains("could not reach nvidia"));
    }

    #[tokio::test]
    async fn anthropic_wiremock_sends_key_and_extracts() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/messages"))
            .and(header("x-api-key", SENTINEL_KEY))
            .and(header("anthropic-version", "2023-06-01"))
            .and(body_partial_json(
                serde_json::json!({ "model": "claude-x", "max_tokens": 1024 }),
            ))
            .respond_with(ResponseTemplate::new(200).set_body_json(
                serde_json::json!({ "content": [{ "type": "text", "text": "hello from mock" }] }),
            ))
            .expect(1)
            .mount(&server)
            .await;
        let client = reqwest::Client::new();
        let out = anthropic_chat_with_base(
            &client,
            &server.uri(),
            SENTINEL_KEY,
            "anthropic",
            "claude-x",
            &sample_pairs(),
        )
        .await
        .expect("wiremock anthropic chat");
        assert_eq!(out, "hello from mock");
    }

    #[tokio::test]
    async fn openai_wiremock_sends_bearer_and_extracts() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .and(header(
                "authorization",
                format!("Bearer {SENTINEL_KEY}"),
            ))
            .and(body_partial_json(serde_json::json!({ "model": "gpt-x" })))
            .respond_with(ResponseTemplate::new(200).set_body_json(
                serde_json::json!({ "choices": [{ "message": { "role": "assistant", "content": "hi mock" } }] }),
            ))
            .expect(1)
            .mount(&server)
            .await;
        let client = reqwest::Client::new();
        let out = openai_chat_with_base(
            &client,
            &server.uri(),
            SENTINEL_KEY,
            "openai",
            "gpt-x",
            &sample_pairs(),
        )
        .await
        .expect("wiremock openai chat");
        assert_eq!(out, "hi mock");
    }

    #[tokio::test]
    async fn key_probe_maps_statuses_and_transport_failures() {
        let client = reqwest::Client::new();
        // 200 -> true.
        let ok_server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({})))
            .mount(&ok_server)
            .await;
        assert!(
            key_probe_with_base(&client, &ok_server.uri(), SENTINEL_KEY, "groq")
                .await
                .unwrap()
        );
        // 401 -> false (key_test logic path).
        let denied = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .respond_with(ResponseTemplate::new(401))
            .mount(&denied)
            .await;
        assert!(
            !key_probe_with_base(&client, &denied.uri(), SENTINEL_KEY, "groq")
                .await
                .unwrap()
        );
        // Transport failure (closed port) -> Err naming the provider, no key.
        let err = key_probe_with_base(&client, "http://127.0.0.1:1", SENTINEL_KEY, "nvidia")
            .await
            .unwrap_err();
        assert!(err.contains("could not reach nvidia"), "got: {err}");
        assert!(!err.contains(SENTINEL_KEY), "key leak: {err}");
    }
}


