/**
 * @file src/routes/(app)/user/user-help.ts
 * @description Help tooltips and styling constants for the user account page.
 */

import {
  userpage_help_2fa,
  userpage_help_appearance,
  userpage_help_avatar,
  userpage_help_card_style,
  userpage_help_collaboration,
  userpage_help_density,
  userpage_help_email,
  userpage_help_high_contrast,
  userpage_help_id,
  userpage_help_magic,
  userpage_help_oauth,
  userpage_help_passkeys,
  userpage_help_password,
  userpage_help_permissions,
  userpage_help_privacy,
  userpage_help_reduced_motion,
  userpage_help_role,
  userpage_help_rtc_enabled,
  userpage_help_rtc_sound,
  userpage_help_sessions,
  userpage_help_tenant,
  userpage_help_username,
} from "@src/paraglide/messages";

/** Setup-style help icon next to a field label */
export function helpTitle(key: string): string {
  const help: Record<string, string> = {
    "2fa": userpage_help_2fa(),
    sessions: userpage_help_sessions(),
    passkeys: userpage_help_passkeys(),
    magic: userpage_help_magic(),
    oauth: userpage_help_oauth(),
    permissions: userpage_help_permissions(),
    appearance: userpage_help_appearance(),
    collaboration: userpage_help_collaboration(),
    "rtc-enabled": userpage_help_rtc_enabled(),
    "rtc-sound": userpage_help_rtc_sound(),
    privacy: userpage_help_privacy(),
    avatar: userpage_help_avatar(),
    role: userpage_help_role(),
    id: userpage_help_id(),
    tenant: userpage_help_tenant(),
    username: userpage_help_username(),
    email: userpage_help_email(),
    password: userpage_help_password(),
    density: userpage_help_density(),
    "card-style": userpage_help_card_style(),
    "reduced-motion": userpage_help_reduced_motion(),
    "high-contrast": userpage_help_high_contrast(),
  };
  return help[key] ?? "";
}

/** One help mark for every label on this page: 14px circle, color of the word beside it. */
export const HELP_BTN_CLASS = "size-3.5! text-current [&_iconify-icon]:size-3.5";
