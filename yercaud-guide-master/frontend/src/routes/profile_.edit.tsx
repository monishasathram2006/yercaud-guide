import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import { PageShell, Breadcrumbs, SignInPrompt } from "@/components/PageShell";
import { UserAvatar } from "@/components/UserAvatar";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CURRENT_USER_KEY, useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import { Save, X, ArrowLeft, Camera, Trash2 } from "lucide-react";

export const Route = createFileRoute("/profile_/edit")({
  head: () => ({
    meta: [
      { title: "Edit Profile — Yercaud Business Directory" },
      { name: "description", content: "Update your Yercaud Guide profile information." },
    ],
  }),
  component: EditProfile,
});

const sections = [
  "Personal Information",
  "Contact Details",
  "Profile Photo",
  "About Me",
  "Email Verification",
] as const;

const GENDER_OPTIONS = ["Female", "Male", "Non-binary", "Prefer not to say"] as const;

/** Digit length of the local number for each supported country code — the one thing that makes "+91<number>" unambiguous. */
const COUNTRY_CODES: { code: string; digits: number }[] = [
  { code: "+91", digits: 10 },
  { code: "+1", digits: 10 },
  { code: "+44", digits: 10 },
  { code: "+61", digits: 9 },
];

/** Splits a stored "+91XXXXXXXXXX" string back into a code + local number for the form's initial state. */
function splitPhone(phone: string | null): { code: string; local: string } {
  if (phone) {
    for (const { code } of COUNTRY_CODES) {
      if (phone.startsWith(code)) return { code, local: phone.slice(code.length) };
    }
  }
  return { code: "+91", local: phone ?? "" };
}

function formFromUser(user: ReturnType<typeof useAuth>["user"]) {
  const { code, local } = splitPhone(user?.phone ?? null);
  return {
    fullName: user?.name ?? "",
    username: user?.username ?? "",
    dob: user?.dateOfBirth ?? "",
    gender: user?.gender ?? "",
    phoneCode: code,
    phoneLocal: local,
    bio: user?.bio ?? "",
  };
}

function EditProfile() {
  const { user, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [form, setForm] = useState(() => formFromUser(user));
  const [photo, setPhoto] = useState<string | null>(user?.avatarUrl ?? null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken">(
    "idle",
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  // /auth/me resolves asynchronously (auth.tsx) — on a hard reload, `user` is
  // still null on this component's first render, so the useState initializer
  // above captures empty defaults. This re-syncs the form once the User's
  // data actually arrives, keyed on id so it fires once per sign-in rather
  // than clobbering in-progress edits on every unrelated cache update.
  useEffect(() => {
    if (user) setForm(formFromUser(user));
    setPhoto(user?.avatarUrl ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Live-typing availability check (issue #14), debounced so it doesn't fire
  // on every keystroke — advisory only, PATCH /me re-validates on save.
  useEffect(() => {
    if (!user || form.username === user.username || form.username.length < 3) {
      setUsernameStatus("idle");
      return;
    }
    setUsernameStatus("checking");
    const handle = setTimeout(() => {
      api.me
        .usernameAvailable(form.username)
        .then((res) => setUsernameStatus(res.available ? "available" : "taken"))
        .catch(() => setUsernameStatus("idle"));
    }, 400);
    return () => clearTimeout(handle);
  }, [form.username, user]);

  const uploadAvatar = useMutation({
    mutationFn: (file: File) => api.me.uploadAvatar(file),
    onSuccess: (updated) => {
      queryClient.setQueryData(CURRENT_USER_KEY, updated);
      setPhoto(updated.avatarUrl);
      setPhotoFile(null);
    },
    onError: (err) => setPhotoError(err instanceof ApiError ? err.message : "Upload failed"),
  });

  const save = useMutation({
    mutationFn: () => {
      const phone = form.phoneLocal.trim() ? `${form.phoneCode}${form.phoneLocal.trim()}` : null;
      return api.me.updateProfile({
        name: form.fullName.trim(),
        username: form.username.trim(),
        phone,
        bio: form.bio.trim() || null,
        dateOfBirth: form.dob || null,
        gender: (form.gender || null) as (typeof GENDER_OPTIONS)[number] | null,
      });
    },
    onSuccess: async (updated) => {
      queryClient.setQueryData(CURRENT_USER_KEY, updated);
      if (photoFile) {
        await uploadAvatar.mutateAsync(photoFile);
      }
    },
  });
  const saved = save.isSuccess && !save.isPending;

  if (!isSignedIn)
    return (
      <PageShell>
        <SignInPrompt
          title="Sign in to edit your profile"
          sub="You need to be signed in to update your details."
        />
      </PageShell>
    );

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
      setPhotoError("Only JPG, PNG or WEBP allowed");
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      setPhotoError("Max size 2 MB");
      return;
    }
    setPhotoError("");
    setPhotoFile(f);
    setPhoto(URL.createObjectURL(f));
  }

  function removePhoto() {
    setPhoto(null);
    setPhotoFile(null);
    setPhotoError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (form.fullName.trim().length < 2) err.fullName = "Enter your name";
    if (form.bio.length > 500) err.bio = "Max 500 characters";
    if (!/^[a-z][a-z0-9_]{2,19}$/.test(form.username)) {
      err.username =
        "3-20 characters: lowercase letters, digits or underscores, starting with a letter";
    } else if (usernameStatus === "taken") {
      err.username = "That username is already taken";
    }
    const expectedDigits = COUNTRY_CODES.find((c) => c.code === form.phoneCode)?.digits;
    if (
      form.phoneLocal.trim() &&
      expectedDigits &&
      !new RegExp(`^\\d{${expectedDigits}}$`).test(form.phoneLocal.trim())
    ) {
      err.phone = `Enter a valid ${expectedDigits}-digit number for ${form.phoneCode}`;
    }
    setErrors(err);
    if (Object.keys(err).length) return;
    // Email isn't validated here any more: it's the login identity, not an
    // editable field, and PATCH /me refuses it.
    save.mutate();
  }

  return (
    <PageShell>
      <Breadcrumbs
        items={[
          { label: "Home", to: "/" },
          { label: "Profile", to: "/profile" },
          { label: "Edit Profile" },
        ]}
      />
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Edit Profile</h1>
            <p className="text-sm text-gray-600">Keep your details up to date.</p>
          </div>
          <Link to="/profile" className="inline-flex items-center gap-1 text-sm text-[#1E7A46]">
            <ArrowLeft className="h-4 w-4" /> Back to Profile
          </Link>
        </div>
        <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-1 rounded-2xl border border-gray-100 bg-white p-3">
              {sections.map((s) => (
                <a
                  key={s}
                  href={`#${s.replace(/\s+/g, "-")}`}
                  className="block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-[#1E7A46]/10 hover:text-[#1E7A46]"
                >
                  {s}
                </a>
              ))}
            </div>
          </aside>
          <div className="space-y-6">
            <Section id="Personal-Information" title="Personal Information">
              <Field
                label="Full Name"
                value={form.fullName}
                onChange={(v) => set("fullName", v)}
                error={errors.fullName}
              />
              <div>
                <Field
                  label="Username"
                  value={form.username}
                  onChange={(v) => set("username", v.toLowerCase())}
                  error={errors.username}
                />
                {!errors.username && usernameStatus === "checking" && (
                  <p className="mt-1 text-xs text-gray-500">Checking availability…</p>
                )}
                {!errors.username && usernameStatus === "available" && (
                  <p className="mt-1 text-xs text-[#1E7A46]">Username available</p>
                )}
                {!errors.username && usernameStatus === "taken" && (
                  <p className="mt-1 text-xs text-red-600">That username is already taken</p>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Date of Birth"
                  type="date"
                  value={form.dob}
                  onChange={(v) => set("dob", v)}
                />
                <SelectField
                  label="Gender"
                  value={form.gender}
                  options={["", ...GENDER_OPTIONS]}
                  optionLabels={{ "": "Prefer not to say" }}
                  onChange={(v) => set("gender", v as typeof form.gender)}
                />
              </div>
            </Section>
            <Section id="Contact-Details" title="Contact Details">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Email</label>
                <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                  {user?.email}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-[100px_1fr]">
                <SelectField
                  label="Code"
                  value={form.phoneCode}
                  options={COUNTRY_CODES.map((c) => c.code)}
                  onChange={(v) => set("phoneCode", v)}
                />
                <Field
                  label="Phone"
                  value={form.phoneLocal}
                  onChange={(v) => set("phoneLocal", v.replace(/[^0-9]/g, ""))}
                  error={errors.phone}
                />
              </div>
            </Section>
            <Section id="Profile-Photo" title="Profile Photo">
              <div className="flex items-center gap-4">
                <UserAvatar
                  src={photo}
                  name={form.fullName || "?"}
                  className="h-20 w-20 rounded-full"
                  fallbackClassName="bg-[#1E7A46]/10 text-xl font-semibold text-[#1E7A46]"
                />
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm">
                  <Camera className="h-4 w-4" /> Upload
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={onPhoto}
                  />
                </label>
                {photo && (
                  <button
                    type="button"
                    onClick={removePhoto}
                    className="inline-flex items-center gap-1 text-sm text-red-600"
                  >
                    <Trash2 className="h-4 w-4" /> Remove
                  </button>
                )}
              </div>
              <p className="mt-2 text-xs text-gray-500">JPG, PNG or WEBP · max 2 MB</p>
              {photoError && <p className="mt-1 text-xs text-red-600">{photoError}</p>}
            </Section>
            <Section id="About-Me" title="About Me">
              <label htmlFor="bio" className="block text-xs font-medium text-gray-600">
                Bio
              </label>
              <textarea
                id="bio"
                rows={5}
                value={form.bio}
                maxLength={500}
                onChange={(e) => set("bio", e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 p-3 text-sm focus:border-[#1E7A46] focus:outline-none"
              />
              <div className="mt-1 flex justify-between text-xs text-gray-500">
                <span>{errors.bio && <span className="text-red-600">{errors.bio}</span>}</span>
                <span>{form.bio.length} / 500</span>
              </div>
            </Section>
            <Section id="Email-Verification" title="Email Verification">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 p-4">
                <div>
                  <div className="text-sm text-gray-700">{user?.email}</div>
                  <div className="text-xs text-[#1E7A46]">
                    {user?.emailVerifiedAt ? "✓ Verified" : "Not verified"}
                  </div>
                </div>
              </div>
            </Section>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={save.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-[#1E7A46] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#186238] disabled:opacity-70"
              >
                <Save className="h-4 w-4" /> {save.isPending ? "Saving…" : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={() => navigate({ to: "/profile" })}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-5 py-2.5 text-sm"
              >
                <X className="h-4 w-4" /> Cancel
              </button>
              {saved && <span className="text-sm text-[#1E7A46]">Changes saved.</span>}
              {save.isError && (
                <span className="text-sm text-red-600">
                  {save.error instanceof ApiError ? save.error.message : "Couldn't save changes."}
                </span>
              )}
            </div>
          </div>
        </form>
      </div>
    </PageShell>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-bold text-gray-900">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
function Field({
  label,
  value,
  onChange,
  type = "text",
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  error?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-gray-600">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#1E7A46] focus:outline-none"
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
function SelectField({
  label,
  value,
  options,
  optionLabels,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  optionLabels?: Record<string, string>;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-gray-600">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {optionLabels?.[o] ?? o}
          </option>
        ))}
      </select>
    </div>
  );
}
