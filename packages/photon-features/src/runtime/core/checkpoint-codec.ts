import { resultSchema, type RecoveryCodec } from "../../contracts/index.js";
/** Runtime-owned codec; never masquerades as a feature's custom recovery payload. */
export const childResultCodec: RecoveryCodec = {
  id: "wt01-child-result",
  version: 1,
  validate: (value) => resultSchema.safeParse(value).success,
  reconcile: async (value) => {
    const parsed = resultSchema.safeParse(value);
    return parsed.success &&
      [
        "executor-completed",
        "provider-accepted",
        "observed-delivered",
        "observed-read",
      ].includes(parsed.data.status)
      ? "completed"
      : "unknown";
  },
};
