# Test Types

Every test is exactly one of these types, chosen by its **subject** (what is under test). Each type sits within one of the standard levels: unit, integration or end-to-end.

| Level       | Types                                      |
| ----------- | ------------------------------------------ |
| Unit        | Logic Test, Component Test                 |
| Integration | Screen Test, Operation Test, Endpoint Test |
| End-to-end  | Flow Test                                  |

Use the type name when proposing seams. A level name alone ("an integration test") is ambiguous: projects draw the lines between levels differently.

## Real infrastructure

Infrastructure the project owns (databases, caches, queues, the file system of a CLI) runs as a real instance, usually in a container, in Operation Tests, Endpoint Tests and Flow Tests. Each test seeds its scenario directly into that infrastructure, then asserts through the subject's interface. Third-party services are still mocked (see [mocking.md](mocking.md)).

## Unit level

### Logic Test

One non-UI function, class or module, run in-process with its system boundaries mocked. Code whose behavior depends on the database gets an Operation Test instead.

### Component Test

One UI component (a button, a modal, a form), mounted in-process. Interact with it as a user would and assert on what it renders. The backend API is mocked when the component calls it.

"Component" here always means a UI component, never a part of the system such as a microservice.

## Integration level

### Screen Test

A whole page or screen (a web page, a mobile screen, a browser extension popup), rendered in-process with the backend API mocked. Interact as a user would and assert on what it renders.

### Operation Test

One backend operation (such as a method on a service class), called in-process against real infrastructure. Other code in the same codebase that it calls runs for real.

### Endpoint Test

One entry point the outside world calls (an HTTP route, an RPC method, a message handler, a CLI command), invoked with real requests against the running backend or built CLI and real infrastructure. Assert on responses and follow-up requests.

## End-to-end level

### Flow Test

One common user journey spanning several features, run against the whole running system. Seed the scenario, drive each step through the system's outermost interface, and assert on what the user sees at each step.

- **Driven through the UI** when the system has one. Drive a flow through the API only for routes the UI never calls (webhooks, public APIs), or when the system has no UI (a backend, a CLI).
- **Few and long.** One Flow Test covers many features at once (every page it visits, the routing between them), so a project has few of them. Write them for the most common journeys, journeys that have historically broken, and journeys with complex logic; full coverage belongs to the other types. A feature usually has one Flow Test, and never more than three.

Examples, each one complete Flow Test:

- User signs in
- User opens the feed, scrolls, opens a post, likes it, scrolls its comments, and leaves a comment
