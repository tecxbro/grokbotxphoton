import type { Action } from "../../contracts/index.js";
import type { NativeDispatch, NativeSpace } from "./sdk.js";

/** Shares only the bound iMessage account's native card. Arbitrary contacts use
 * the separate contact.send contract and cannot enter this operation. */
export async function shareAccountContact(
  action: Extract<Action, { operation: "account.shareContact" }>,
  space: NativeSpace,
  dispatch: NativeDispatch,
): Promise<void> {
  void action;
  await dispatch(() => space.shareContactCard());
}
