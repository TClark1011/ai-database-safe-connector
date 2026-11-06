# When to Mock

Mock at **system boundaries** only:

- External APIs and SDKs (payment, email, etc.)
- Time/randomness
- File system (with an in-memory replacement such as `memfs`)
- The backend API, in Component Tests and Screen Tests
- Wrappers (below): the one kind of module you own that you mock

The database is never mocked: code that depends on it runs against a real one (see [test-types.md](test-types.md)).

Everything else you own runs for real in tests: your classes, modules and internal collaborators.

## Wrappers

A **wrapper** is a thin module you write around a dependency that is hard to mock directly, so tests mock the wrapper instead of the dependency. It counts as a system boundary: it is the only code that touches the dependency, and it holds no logic of its own.

Wrap a dependency only when mocking it directly is hard: SDKs with deep object graphs or chained calls (Stripe, AWS SDKs), clients that need network setup. Use the dependency directly when a well-adopted replacement or framework feature already mocks it cleanly: `memfs` for the file system, fake timers for time.

```typescript
// payments.ts: the only file that imports Stripe
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_KEY);

export const payments = {
  chargeOrder: async (order: Order): Promise<ChargeResult> => {
    const intent = await stripe.paymentIntents.create({
      amount: order.totalCents,
      currency: order.currency,
      payment_method: order.paymentMethodId,
      confirm: true,
    });
    return { paid: intent.status === "succeeded" };
  },
};
```

```typescript
// checkout.test.ts
vi.mock("./payments");

test("order is confirmed when payment succeeds", async () => {
  vi.mocked(payments.chargeOrder).mockResolvedValue({ paid: true });
  const result = await checkout(cart);
  expect(result.status).toBe("confirmed");
});
```

A good wrapper:

- **Is named for what the project needs**, not the vendor (`payments`, not `CustomStripeClient`), and takes and returns the project's own types, so mocks return small, project-shaped values.
- **Is thin.** Tests never run it, so it only translates calls; any logic belongs in the code that calls it.
- **Has one method per operation**, rather than one generic method with conditional logic:

```typescript
// GOOD: Each method is independently mockable
export const users = {
  getUser: (id) => fetch(`/users/${id}`),
  getOrders: (userId) => fetch(`/users/${userId}/orders`),
  createOrder: (data) => fetch("/orders", { method: "POST", body: data }),
};

// BAD: Mocking requires conditional logic inside the mock
export const api = {
  fetch: (endpoint, options) => fetch(endpoint, options),
};
```

One method per operation means:

- Each mock returns one specific shape
- No conditional logic in test setup
- Easier to see which operations a test exercises
- Type safety per operation
