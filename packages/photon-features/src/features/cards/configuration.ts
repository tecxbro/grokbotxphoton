import { z } from 'zod';
import type { Action, ActionFor, ContentSpec, ExecutionServices, Scope, TrustedContext, RuntimeError } from '../../index.js';
import { httpsSchema, idSchema } from '../../index.js';

export type CardLayout = NonNullable<Extract<ContentSpec, { type: 'app' }>['layout']>;
export interface CardTemplate {
  id: string;
  kind: 'universal' | 'customized';
  /** Exact host-approved origins; never default to an invented deployment. */
  origins: readonly string[];
  extension?: { appName: string; teamId: string; extensionBundleId: string; appStoreId?: number };
  live?: { installedExtensionVerified: boolean; evidence: string };
  /** Universal app() has no layout input. The real backend must map updates to a URL. */
  updateUrl?: (layout: CardLayout, context: TrustedContext) => Promise<string>;
  interactions?: { participantIds: readonly string[]; actionIds: readonly string[]; ttlMs: number; backendContractId: string };
}
export interface CardOptions {
  templates: readonly CardTemplate[];
  binding(context: TrustedContext): { scope: Scope; phone: string; nativeSpaceId: string };
  /** Identity allocated by the shared executor; this feature never creates an outbox. */
  requestId(action: Action, services: ExecutionServices): string;
  /** Immutable expected revision captured by the shared host at request admission.
   * Do not read the latest card revision here: that would permit delayed stale intents.
   * F0 has no argument for this; absent bindings block updates, not sends. */
  updateRevision?: (action: ActionFor<'app.update'>, services: ExecutionServices) => number | undefined;
}
export class CardError extends Error {
  constructor(readonly code: RuntimeError['code'], message: string, readonly blockerId?: string) { super(message); }
}
export function requireCard(value: unknown, code: RuntimeError['code'], message: string, blockerId?: string): asserts value {
  if (!value) throw new CardError(code, message, blockerId);
}
const extensionSchema = z.strictObject({
  appName: z.string().min(1).max(200), teamId: z.string().regex(/^[A-Z0-9]{10}$/),
  extensionBundleId: z.string().min(3).max(200).regex(/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/),
  appStoreId: z.number().int().positive().optional(),
});
export function templateFor(options: CardOptions, id: string): CardTemplate {
  const matches = options.templates.filter(t => t.id === id);
  requireCard(matches.length === 1, 'UNAVAILABLE', 'A unique registered app template is required.', 'card_template_missing');
  const template = matches[0]!;
  requireCard(template.kind === 'universal' || template.kind === 'customized', 'INVALID_REQUEST', 'Invalid card template kind.');
  requireCard(template.origins.length > 0 && template.origins.length <= 32, 'UNAVAILABLE', 'Configured app origins are required.', 'card_origin_missing');
  for (const origin of template.origins) {
    const parsed = new URL(httpsSchema.parse(origin));
    requireCard(parsed.origin === origin && !parsed.username && !parsed.password, 'INVALID_REQUEST', 'App origins must be canonical HTTPS origins.');
  }
  if (template.kind === 'customized') requireCard(extensionSchema.safeParse(template.extension).success,
    'UNAVAILABLE', 'Customized cards require configured Apple Team ID, bundle identifier and app name.', 'customized_extension_missing');
  if (template.live) requireCard(template.live.installedExtensionVerified && template.live.evidence.trim().length > 0,
    'UNAVAILABLE', 'Live rendering requires evidence for the configured installed extension.', 'live_extension_unverified');
  if (template.interactions) {
    const b = template.interactions;
    requireCard(b.participantIds.length > 0 && b.participantIds.length <= 32 && b.actionIds.length > 0 && b.actionIds.length <= 32 &&
      Number.isSafeInteger(b.ttlMs) && b.ttlMs > 0 && b.ttlMs <= 86400000, 'INVALID_REQUEST', 'Invalid interaction registration.');
    for (const id of [...b.participantIds, ...b.actionIds, b.backendContractId]) idSchema.parse(id);
  }
  return template;
}
export function approvedUrl(template: CardTemplate, input: string): string {
  const value = httpsSchema.parse(input), url = new URL(value);
  requireCard(!url.username && !url.password && template.origins.includes(url.origin), 'FORBIDDEN', 'App URL is outside the registered origins.');
  return value;
}
