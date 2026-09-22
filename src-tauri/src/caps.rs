#[cfg(test)]
mod caps_tests {
    #[test]
    fn manifest_forbids_blanket_perms() {
        let raw = std::fs::read_to_string("capabilities/default.json").unwrap();
        assert!(!raw.contains("\"*\""), "blanket permission present");
    }
    #[test]
    fn csp_is_strict() {
        let raw = std::fs::read_to_string("tauri.conf.json").unwrap();
        assert!(!raw.contains("\"csp\": null"), "CSP disabled");
        assert!(raw.contains("default-src 'self'"), "strict CSP missing");
    }
}
