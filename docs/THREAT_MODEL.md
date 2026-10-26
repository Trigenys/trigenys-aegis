# Aegis threat model · draft 0.1

**System status:** AppFactory bootstrap, not a deployed security monitor.

## Protected assets and trust boundaries

- Tenant-owned source events, incident histories and sensitive configuration-change metadata.
- Producer API credentials, signing secrets, organization permissions and alert channels.
- Tenant identity and authorization: **derived from authenticated source credentials**, never the event payload.
- Integrity evidence: encrypted events stay off-chain, with optional independent verification of batch fingerprints.

```text
External application -- authenticated + rate-limited ingestion boundary -->
per-tenant schema validation -- privacy-minimizing normalizer -->
tenant-partitioned evidence and correlator --> incident -->
approved response / notification adapter
```

## Principal attack paths

| Threat | Defensive requirement |
| --- | --- |
| Cross-tenant event spoofing or querying | Tenant established server-side, tested across all read/write paths |
| Malicious/high-volume event injection | Source credentials, quotas, timestamp windows and replay prevention |
| Exfiltration via logs and AI summaries | Field allowlists, redaction, access controls and bounded retention |
| Suppression, deletion or reordering of events | Authenticated ingestion, hash/sequence verification and protected storage |
| Automated response misfiring | Default to notifications, require explicit opt-in and human approval for destructive operations |
| Alert fatigue / intentionally crafted false positives | Rule references, thresholds, measurable precision and human review |
| Compromised integration or replayed webhook | Credential rotation, signed/replay-safe messages, source identity validation |

## Security invariants

1. A tenant cannot write, read, search or export another tenant's events or incidents.
2. A model output cannot authorize an action, overwrite incident evidence or waive a deny rule.
3. A malformed or unauthenticated event is rejected before persistence.
4. Event fingerprints never substitute for producer authentication or source integrity.
5. Public blockchain anchors contain no raw logs, secrets or customer identifiers.
6. Every severity judgment includes source events and a versioned rule explanation.
7. Operational failure is visible and does not silently report security monitoring success.

## Planned evaluations

Tenant-isolation negative tests; replay/duplicate fixtures; source tampering; noisy or malformed event floods; private-data redaction; rule precision and latency measurements; evidence verifier tampering trials.

**Design references:** [NIST CSF 2.0](https://www.nist.gov/cyberframework), [OWASP API Security Top 10](https://owasp.org/API-Security/editions/2023/en/0x11-t10/), [MITRE ATT&CK](https://attack.mitre.org/). This is not a conformity or readiness claim.
