# Capability Contract Lifecycle

A capability is a stable business action such as `ai.text.generate`. Applications
request capabilities; they never select providers, API keys, or arbitrary URLs.

## Candidate

Creating a proposal writes only `capability_proposals` with status `candidate`.
A candidate includes:

- stable dotted identifier and human label;
- purpose description;
- primary and optional fallback provider IDs;
- JSON input and output contracts;
- data classification;
- retention policy;
- author and timestamp.

Candidates are absent from the active capability API, application grant forms,
Agent discovery, and Gateway routing. Merely proposing a capability cannot expand
an application's authority.

## Activation

Activation is a structural contract publication. The control plane requires an
authenticated session, CSRF token, and the exact phrase:

```text
ACTIVATE <capability-id>
```

Activation atomically creates the active capability and contract, marks the
proposal activated, and appends an audit event. It does not automatically grant
the capability to any application. Grants remain a separate least-privilege step.

## Runtime enforcement

Gateway discovery returns only activated contracts that are also granted to the
calling application. Invocation validates required fields, additional-property
policy, basic JSON types, and configured string length limits before rate policy.
Invalid input is denied as `input_contract_violation`. Request input is not added
to invocation or audit storage.

The MVP validator intentionally supports a safe JSON-contract subset. Production
activation of complex schemas requires a reviewed standards-compliant validator,
schema versioning, backward-compatibility rules, and contract migration policy.
