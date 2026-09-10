import test from 'node:test';
import assert from 'node:assert/strict';
import { Spectrum, text, poll, option, app, read, type ContentInput, type Message, type Space } from 'spectrum-ts';
import { imessage, effect, type IMessageMessage } from 'spectrum-ts/providers/imessage';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
/** Compile-only public SDK probes; never construct a live Spectrum connection. */
async function publicProbe(message:Message,space:Space) {
 const content:ContentInput=text('hello');await space.send(content);await space.send(poll('Choose',option('A'),option('B')));await space.send(app('https://example.com'));
 await message.read();await space.send(read(message));await space.send(effect(text('hello'),imessage.effect.message.lasers));
 const narrowed:IMessageMessage=imessage(message);const session=narrowed.miniAppCardSession;return session;
}
test('pinned SDK public exports load and builder signatures compile',()=>{
 assert.equal(typeof Spectrum,'function');assert.equal(typeof imessage.config,'function');assert.equal(typeof publicProbe,'function');assert.ok(text('hello'));assert.ok(poll('Choose',option('A'),option('B')));assert.ok(app('https://example.com'));
 const require=createRequire(import.meta.url);const entry=require.resolve('spectrum-ts');const pkg=JSON.parse(readFileSync(resolve(dirname(entry),'../package.json'),'utf8'));assert.equal(pkg.version,'12.8.0');
});
