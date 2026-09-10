/** Public reference aliases share the existing strict wire schemas; resolve records before use. */
export * from "./resources.js";
import type { ResourceRef } from "./resources.js";
export type MessageRef = Extract<ResourceRef, {kind: "message"}>;
export type ReactionRef = Extract<ResourceRef, {kind: "reaction"}>;
export type PollRef = Extract<ResourceRef, {kind: "poll"}>;
export type CardRef = Extract<ResourceRef, {kind: "card"}>;
export type AttachmentRef = Extract<ResourceRef, {kind: "attachment"}>;
