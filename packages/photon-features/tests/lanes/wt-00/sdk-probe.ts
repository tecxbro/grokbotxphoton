// Compile-only functions: never instantiate a client or send a message in tests.
import {
  Spectrum,
  text,
  markdown,
  richlink,
  attachment,
  voice,
  contact,
  poll,
  option,
  group,
  app,
  stream,
  type Space,
  type Message,
  type ContentInput,
} from "spectrum-ts";
import {
  imessage,
  background,
  nativeContactCard,
  customizedMiniApp,
  effect,
} from "spectrum-ts/providers/imessage";
export const publicImports: Record<string, unknown> = {
  Spectrum,
  imessage,
  text,
  markdown,
  richlink,
  attachment,
  voice,
  contact,
  poll,
  option,
  group,
  app,
  stream,
  background,
  nativeContactCard,
  customizedMiniApp,
  effect,
};
export async function probePublicSpace(
  space: Space,
  message: Message,
  content: ContentInput,
) {
  await space.send(content);
  await space.startTyping();
  await space.stopTyping();
  await space.getMessage(message.id);
  await message.reply(content);
  await message.react("❤️");
  await message.edit(content);
  await message.unsend();
  await message.read();
  await space.getDisplayName();
  await space.getMembers();
  await space.getAvatar();
  await space.rename("name");
  await space.leave();
  if (message.platform === "imessage") {
    const native = imessage(space);
    const nativeMessage = imessage(message);
    const line: string = native.phone;
    const delivered: Date | undefined = nativeMessage.dateDelivered;
    await native.background("clear");
    await native.shareContactCard();
    return { line, delivered };
  }
  return undefined;
}
export async function probePublicApp() {
  const instance = await Spectrum({
    projectId: "compile-only",
    projectSecret: "compile-only",
    providers: [imessage.config()],
  });
  const provider = imessage(instance);
  const user = await provider.user("+15555550100");
  await provider.space.create(user);
  await instance.stop();
}
