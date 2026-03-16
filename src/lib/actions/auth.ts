"use server";

import { createClient, getAuthUser } from "@/lib/supabase/server";

export type AuthResult = {
  error?: string;
  success?: boolean;
};

export async function signup(formData: FormData): Promise<AuthResult> {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const realName = formData.get("realName") as string;
  const nickname = formData.get("nickname") as string;

  if (!email || !realName || !nickname) {
    return { error: "All fields are required" };
  }

  const domain = email.split("@")[1];
  if (!domain) {
    return { error: "Invalid email format" };
  }

  const { data: allowedDomains, error: domainError } = await supabase
    .from("allowed_domains")
    .select("domain")
    .eq("domain", domain)
    .single();

  if (domainError) {
    console.error("[signup] Domain check error:", domainError);
  }

  if (!allowedDomains) {
    return { error: "INVALID_DOMAIN" };
  }

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .single();

  if (existingProfile) {
    return { error: "EMAIL_EXISTS" };
  }

  const tempPassword = Math.random().toString(36).slice(-8);

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password: tempPassword,
    options: {
      data: {
        real_name: realName,
        nickname: nickname,
      },
    },
  });

  if (authError) {
    return { error: authError.message };
  }

  if (authData.user) {
    const { error: profileError } = await supabase.rpc("create_profile", {
      user_id: authData.user.id,
      user_email: email,
      user_real_name: realName,
      user_nickname: nickname,
    });

    if (profileError) {
      console.error("[signup] Profile creation error:", profileError);
      return { error: profileError.message };
    }
  }

  await supabase.auth.signOut();

  return { success: true };
}

export async function login(formData: FormData): Promise<AuthResult> {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  if (password.length !== 4 || !/^\d{4}$/.test(password)) {
    return { error: "INVALID_PASSWORD_FORMAT" };
  }

  const { error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError) {
    return { error: "INVALID_CREDENTIALS" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("status, role")
    .eq("email", email)
    .single();

  if (!profile) {
    await supabase.auth.signOut();
    return { error: "PROFILE_NOT_FOUND" };
  }

  if (profile.status === "pending") {
    await supabase.auth.signOut();
    return { error: "PENDING_APPROVAL" };
  }

  if (profile.status === "disabled") {
    await supabase.auth.signOut();
    return { error: "ACCOUNT_DISABLED" };
  }

  return { success: true };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

export async function updateNickname(nickname: string): Promise<AuthResult> {
  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) return { error: "AUTH_REQUIRED" };

  const trimmed = nickname.trim();
  if (!trimmed || trimmed.length > 20) {
    return { error: "닉네임은 1~20자 사이로 입력해주세요" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ nickname: trimmed })
    .eq("id", user.id);

  if (error) return { error: error.message };
  return { success: true };
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<AuthResult> {
  if (!newPassword || newPassword.length !== 4 || !/^\d{4}$/.test(newPassword)) {
    return { error: "새 비밀번호는 4자리 숫자여야 합니다" };
  }

  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) return { error: "로그인이 필요합니다" };

  const { error } = await supabase.rpc("change_own_password", {
    current_password: currentPassword,
    new_password: newPassword,
  });

  if (error) {
    if (error.message.includes("INVALID_CURRENT_PASSWORD")) {
      return { error: "현재 비밀번호가 올바르지 않습니다" };
    }
    return { error: error.message };
  }

  return { success: true };
}

export async function getCurrentProfile() {
  const supabase = await createClient();

  const user = await getAuthUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return profile;
}
