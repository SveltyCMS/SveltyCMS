/**
 * @file tests/unit/routes/email-previews.test.ts
 * @description Load/action gating for the email preview route.
 *
 * Only boundaries are mocked: the previewer package (filesystem listing + form
 * actions), the email renderer, and the LocalCMS SDK. The route's own auth gate,
 * admin gate and template-selection logic run unmodified.
 *
 * ### Features tested
 * - 401 `UNAUTHORIZED` raise for an unauthenticated load
 * - 403 `FORBIDDEN` raise for an authenticated non-admin load
 * - Admin load returns the sorted file list plus the rendered preview HTML
 * - Action gate blocks non-admins before the previewer handler runs
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@src/databases/auth/types";

const { emailListMock, getEmailTemplateMock, renderEmailToStringsMock, createEmailAction } =
  vi.hoisted(() => ({
    emailListMock: vi.fn(),
    getEmailTemplateMock: vi.fn(),
    renderEmailToStringsMock: vi.fn(),
    createEmailAction: vi.fn(),
  }));

vi.mock("@better-svelte-email/preview", () => ({
  emailList: emailListMock,
  createEmail: () => ({ "create-email": createEmailAction }),
  sendEmail: () => ({ "send-email": vi.fn() }),
}));

vi.mock("@utils/email.server", () => ({
  getEmailTemplate: getEmailTemplateMock,
  renderEmailToStrings: renderEmailToStringsMock,
}));

vi.mock("@src/services/sdk", () => ({
  LocalCMS: class LocalCMS {},
}));

import { load, actions } from "@src/routes/email-previews/+page.server";

type LoadEvent = Parameters<typeof load>[0];
type ActionEvent = Parameters<(typeof actions)[string]>[0];

const adminUser = {
  _id: "admin-1",
  email: "admin@example.com",
  username: "admin",
} as unknown as User;

const regularUser = {
  _id: "user-1",
  email: "user@example.com",
  username: "user",
} as unknown as User;

function makeLoadEvent(user: User | null, isAdmin: boolean, search = ""): LoadEvent {
  return {
    locals: { user, isAdmin } as unknown as LoadEvent["locals"],
    url: new URL(`http://localhost/email-previews${search}`),
    fetch: globalThis.fetch,
  };
}

function makeActionEvent(user: User | null, isAdmin: boolean): ActionEvent {
  return { locals: { user, isAdmin } } as unknown as ActionEvent;
}

describe("email-previews load", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("raises 401 when the request has no user", async () => {
    await expect(load(makeLoadEvent(null, false))).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
    expect(emailListMock).not.toHaveBeenCalled();
  });

  it("raises 403 for an authenticated non-admin", async () => {
    await expect(load(makeLoadEvent(regularUser, false))).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
    expect(emailListMock).not.toHaveBeenCalled();
  });

  it("returns the sorted file list and rendered HTML for an admin", async () => {
    const template = { render: vi.fn() };
    emailListMock.mockResolvedValue({
      files: ["welcomeUser.svelte", "auth/resetPassword.svelte"],
    });
    getEmailTemplateMock.mockResolvedValue(template);
    renderEmailToStringsMock.mockResolvedValue({
      html: "<html>preview</html>",
      text: "preview",
    });

    const result = await load(makeLoadEvent(adminUser, true, "?email=welcomeUser.svelte"));

    expect(result.files).toEqual(["auth/resetPassword.svelte", "welcomeUser.svelte"]);
    expect(result.selectedEmail).toBe("welcomeUser.svelte");
    expect(result.previewHtml).toBe("<html>preview</html>");
    expect(result.previewError).toBeNull();
    expect(result.user).toBe(adminUser);
    expect(emailListMock).toHaveBeenCalledWith({ path: "src/components/emails" });
    expect(getEmailTemplateMock).toHaveBeenCalledWith("welcomeUser.svelte");
    expect(renderEmailToStringsMock).toHaveBeenCalledWith(
      template,
      "welcomeUser.svelte",
      expect.objectContaining({ email: "preview@example.com", sitename: "SveltyCMS (Preview)" }),
    );
  });

  it("ignores a requested template outside the directory listing", async () => {
    emailListMock.mockResolvedValue({ files: ["b.svelte", "a.svelte"] });
    getEmailTemplateMock.mockResolvedValue({ render: vi.fn() });
    renderEmailToStringsMock.mockResolvedValue({ html: "<html>a</html>", text: "a" });

    const result = await load(makeLoadEvent(adminUser, true, "?email=../../etc/passwd"));

    expect(result.selectedEmail).toBe("a.svelte");
    expect(getEmailTemplateMock).toHaveBeenCalledWith("a.svelte");
  });
});

describe("email-previews actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks a non-admin action with 403 before the previewer handler runs", async () => {
    await expect(
      actions["create-email"](makeActionEvent(regularUser, false)),
    ).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
    expect(createEmailAction).not.toHaveBeenCalled();
  });

  it("allows an admin action to reach the previewer handler", async () => {
    createEmailAction.mockResolvedValue({ status: 200, body: "<p>preview</p>" });

    await expect(actions["create-email"](makeActionEvent(adminUser, true))).resolves.toEqual({
      status: 200,
      body: "<p>preview</p>",
    });
    expect(createEmailAction).toHaveBeenCalledTimes(1);
  });
});
