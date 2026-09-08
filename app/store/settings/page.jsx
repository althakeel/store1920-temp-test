"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import toast from "react-hot-toast";
import {
  Building2,
  Camera,
  ChevronRight,
  CreditCard,
  Database,
  History,
  Mail,
  Save,
  Shield,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import { auth } from "@/lib/firebase";
import { updateProfile } from "firebase/auth";
import PermissionPicker from "@/components/store/PermissionPicker";
import {
  SIDEBAR_ACCESS_COMPONENTS,
  countEnabledPermissions,
  getDefaultPermissions,
} from "@/lib/storeDashboardPermissions";

const TAB_META = {
  profile: {
    label: "Profile",
    icon: UserRound,
    description: "Your name, email, and photo",
  },
  store: {
    label: "Store",
    icon: Building2,
    description: "Business details and address",
  },
  preferences: {
    label: "Preferences",
    icon: Sparkles,
    description: "Currency, alerts, and SMTP",
  },
  payments: {
    label: "Payments",
    icon: CreditCard,
    description: "Show or hide checkout methods",
  },
  dashboardAccess: {
    label: "Team Access",
    icon: Shield,
    description: "Invite staff and set permissions",
  },
  dataImport: {
    label: "Data Import",
    icon: Database,
    description: "Migrate WordPress / WooCommerce",
  },
  history: {
    label: "History",
    icon: History,
    description: "Super admin activity log",
  },
};

function SettingsCard({ title, description, children, className = "" }) {
  return (
    <section className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6 ${className}`}>
      {(title || description) && (
        <div className="mb-5 border-b border-slate-100 pb-4">
          {title ? <h3 className="text-base font-semibold text-slate-900">{title}</h3> : null}
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
      )}
      {children}
    </section>
  );
}

function Field({ label, children, className = "" }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15";

function isAllowedProfileImage(file) {
  if (!file) return false;
  if (file.type?.startsWith("image/")) return true;
  const ext = String(file.name || "").split(".").pop()?.toLowerCase();
  return ["jpg", "jpeg", "png", "webp", "gif", "bmp", "heic", "heif"].includes(ext);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the selected image."));
    reader.readAsDataURL(file);
  });
}

function ToggleRow({ title, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3.5">
      <div>
        <p className="text-sm font-medium text-slate-800">{title}</p>
        {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
      </div>
      <label className="relative inline-flex shrink-0 cursor-pointer items-center">
        <input type="checkbox" checked={checked} onChange={onChange} className="peer sr-only" />
        <div className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-indigo-600 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
      </label>
    </div>
  );
}

export default function SettingsPage() {
  const { user, getToken, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState("profile");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [invitePermissions, setInvitePermissions] = useState(getDefaultPermissions());

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [image, setImage] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imageVersion, setImageVersion] = useState(0);
  const [imageBroken, setImageBroken] = useState(false);

  const [storeName, setStoreName] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [storeWebsite, setStoreWebsite] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [storeCity, setStoreCity] = useState("");
  const [storeState, setStoreState] = useState("");
  const [storeZip, setStoreZip] = useState("");
  const [storeDescription, setStoreDescription] = useState("");
  const [businessType, setBusinessType] = useState("");

  const [emailNotifications, setEmailNotifications] = useState(true);
  const [teamMembers, setTeamMembers] = useState([]);
  const [memberPermissions, setMemberPermissions] = useState({});
  const [editingMemberId, setEditingMemberId] = useState(null);
  const [deletingMemberId, setDeletingMemberId] = useState(null);
  const [memberPendingDelete, setMemberPendingDelete] = useState(null);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [currencyPreference, setCurrencyPreference] = useState("AED");
  const [transactionalSmtp, setTransactionalSmtp] = useState({
    host: "",
    port: 465,
    user: "",
    pass: "",
    secure: true,
    fromEmail: "",
    fromName: "",
  });
  const [promotionalSmtp, setPromotionalSmtp] = useState({
    host: "",
    port: 465,
    user: "",
    pass: "",
    secure: true,
    fromEmail: "",
    fromName: "",
  });

  const [paymentMethods, setPaymentMethods] = useState({
    enableCOD: true,
    enableCard: true,
    enableTabby: true,
    enableTamara: true,
  });
  const [paymentMethodsLoaded, setPaymentMethodsLoaded] = useState(false);
  const [loadingPayments, setLoadingPayments] = useState(false);

  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [message, setMessage] = useState("");
  const [localPreviewUrl, setLocalPreviewUrl] = useState(null);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [isStoreOwner, setIsStoreOwner] = useState(false);
  const [canManageTeamAccess, setCanManageTeamAccess] = useState(false);
  const [canViewActivityHistory, setCanViewActivityHistory] = useState(false);

  const settingsTabs = useMemo(() => {
    const tabs = ["profile", "store", "preferences", "payments", "dataImport"];
    if (canManageTeamAccess) tabs.splice(4, 0, "dashboardAccess");
    if (canViewActivityHistory) tabs.push("history");
    return tabs;
  }, [canManageTeamAccess, canViewActivityHistory]);

  const isFormTab = ["profile", "store", "preferences", "payments"].includes(activeTab);
  const activeMeta = TAB_META[activeTab] || TAB_META.profile;

  const loadSettings = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await axios.get("/api/store/profile/update", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const profile = res.data?.profile || {};
      const store = res.data?.store || {};
      const smtp = res.data?.smtpSettings || {};

      setName(profile.name || user?.displayName || user?.name || "");
      setEmail(profile.email || user?.email || "");
      if (profile.image) {
        setImage(profile.image);
        setImageVersion(Date.now());
      } else {
        setImage((prev) => prev || user?.photoURL || user?.image || "");
      }

      setStoreName(store.storeName || "");
      setStorePhone(store.storePhone || "");
      setStoreWebsite(store.storeWebsite || "");
      setStoreAddress(store.storeAddress || "");
      setStoreCity(store.storeCity || "");
      setStoreState(store.storeState || "");
      setStoreZip(store.storeZip || "");
      setStoreDescription(store.storeDescription || "");
      setBusinessType(store.businessType || "");
      setCurrencyPreference(store.currencyPreference || "AED");
      setEmailNotifications(profile.emailNotifications !== false);
      setTwoFactorEnabled(Boolean(profile.twoFactorEnabled));

      setTransactionalSmtp({
        host: smtp?.transactional?.host || "",
        port: Number(smtp?.transactional?.port || 465),
        user: smtp?.transactional?.user || "",
        pass: smtp?.transactional?.pass || "",
        secure: typeof smtp?.transactional?.secure === "boolean" ? smtp.transactional.secure : true,
        fromEmail: smtp?.transactional?.fromEmail || "",
        fromName: smtp?.transactional?.fromName || "",
      });

      setPromotionalSmtp({
        host: smtp?.promotional?.host || "",
        port: Number(smtp?.promotional?.port || 465),
        user: smtp?.promotional?.user || "",
        pass: smtp?.promotional?.pass || "",
        secure: typeof smtp?.promotional?.secure === "boolean" ? smtp.promotional.secure : true,
        fromEmail: smtp?.promotional?.fromEmail || "",
        fromName: smtp?.promotional?.fromName || "",
      });
    } catch {
      setName(user?.displayName || user?.name || "");
      setEmail(user?.email || "");
      setImage((prev) => prev || user?.photoURL || user?.image || "");
    }
  };

  useEffect(() => {
    if (user?.uid) loadSettings();
  }, [user?.uid]);

  const loadPaymentMethods = async () => {
    try {
      setLoadingPayments(true);
      const token = await getToken();
      if (!token) return;
      const { data } = await axios.get("/api/shipping", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const setting = data?.setting || {};
      setPaymentMethods({
        enableCOD: setting.enableCOD !== false,
        enableCard: setting.enableCard !== false,
        enableTabby: setting.enableTabby !== false,
        enableTamara: setting.enableTamara !== false,
      });
      setPaymentMethodsLoaded(true);
    } catch {
      toast.error("Could not load payment method settings");
    } finally {
      setLoadingPayments(false);
    }
  };

  useEffect(() => {
    if (user && activeTab === "payments" && !paymentMethodsLoaded) {
      loadPaymentMethods();
    }
  }, [user, activeTab, paymentMethodsLoaded, getToken]);

  useEffect(() => {
    const loadAccessRole = async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const { data } = await axios.get("/api/store/is-seller", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setIsStoreOwner(Boolean(data?.isOwner));
        setCanManageTeamAccess(Boolean(data?.canManageTeamAccess));
        setCanViewActivityHistory(Boolean(data?.canViewActivityHistory));
      } catch {
        setIsStoreOwner(false);
        setCanViewActivityHistory(false);
      }
    };

    if (user) loadAccessRole();
  }, [user, getToken]);

  useEffect(() => {
    if (!canManageTeamAccess && activeTab === "dashboardAccess") {
      setActiveTab("profile");
    }
  }, [canManageTeamAccess, activeTab]);

  useEffect(() => {
    if (typeof window === "undefined" || !canManageTeamAccess) return;
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "team" || tab === "users" || tab === "dashboardAccess") {
      setActiveTab("dashboardAccess");
    }
  }, [canManageTeamAccess]);

  useEffect(() => {
    if (typeof window === "undefined" || !canViewActivityHistory) return;
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "history") {
      window.location.replace("/store/settings/history");
    }
  }, [canViewActivityHistory]);

  const fetchTeamMembers = async () => {
    setLoadingTeam(true);
    try {
      const token = await getToken();
      const res = await axios.get("/api/store/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTeamMembers(res.data.users || []);
      const permissions = {};
      res.data.users?.forEach((member) => {
        permissions[member.id] = {
          ...getDefaultPermissions(),
          ...(member.permissions || {}),
        };
      });
      setMemberPermissions(permissions);
    } catch {
      setMessage("Failed to load team members");
    } finally {
      setLoadingTeam(false);
    }
  };

  const handleDeleteTeamMember = async (member) => {
    if (!member?.id) return;

    setDeletingMemberId(member.id);
    try {
      const token = await getToken();
      await axios.post(
        "/api/store/users/delete",
        { userId: member.id, userEmail: member.email },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      toast.success("Team member removed");
      if (editingMemberId === member.id) setEditingMemberId(null);
      setMemberPendingDelete(null);
      setMemberPermissions((prev) => {
        const next = { ...prev };
        delete next[member.id];
        return next;
      });
      setTeamMembers((prev) => prev.filter((entry) => entry.id !== member.id));
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to remove team member");
    } finally {
      setDeletingMemberId(null);
    }
  };

  useEffect(() => {
    if (activeTab === "dashboardAccess" && canManageTeamAccess) fetchTeamMembers();
  }, [activeTab, canManageTeamAccess, getToken]);

  useEffect(() => {
    if (!imageFile) {
      setLocalPreviewUrl(null);
      return undefined;
    }

    const objectUrl = URL.createObjectURL(imageFile);
    setLocalPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  const imagePreview = useMemo(() => {
    if (localPreviewUrl) return localPreviewUrl;
    if (!image) return null;
    const separator = image.includes("?") ? "&" : "?";
    return `${image}${separator}v=${imageVersion || 0}`;
  }, [localPreviewUrl, image, imageVersion]);

  useEffect(() => {
    setImageBroken(false);
  }, [imagePreview]);

  const profileInitial = (name?.[0] || email?.[0] || "U").toUpperCase();

  const syncFirebaseProfilePhoto = async (photoURL, displayName) => {
    if (!auth.currentUser || !photoURL) return;
    try {
      await updateProfile(auth.currentUser, {
        photoURL,
        displayName: displayName?.trim() || undefined,
      });
      await refreshUser?.();
    } catch (error) {
      console.warn("[settings] Firebase profile photo sync failed:", error?.message || error);
    }
  };

  const uploadProfilePhotoFile = async (file) => {
    if (!isAllowedProfileImage(file)) {
      throw new Error("Please choose a PNG, JPG, or WEBP image.");
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error("Profile photo must be 5 MB or smaller.");
    }

    const token = await getToken(true);
    if (!token) {
      throw new Error("Your session expired. Please sign in again.");
    }

    const formData = new FormData();
    formData.append("image", file, file.name || "profile.jpg");

    let updateRes = await fetch("/api/store/profile/update", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    let updateData = await updateRes.json().catch(() => ({}));

    if (!updateRes.ok) {
      const imageBase64 = await readFileAsDataUrl(file);
      const fallbackRes = await axios.post(
        "/api/store/profile/update",
        { imageBase64 },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      updateData = fallbackRes.data;
    }

    if (!updateRes.ok && !updateData?.profile?.image) {
      throw new Error(updateData?.error || "Failed to upload profile photo");
    }

    const savedImage = updateData?.profile?.image;
    if (!savedImage) {
      throw new Error("Photo uploaded but could not be saved to your profile.");
    }

    setImage(savedImage);
    setImageVersion(Date.now());
    setImageBroken(false);
    setImageFile(null);
    setPhotoError("");
    await syncFirebaseProfilePhoto(savedImage, name);
    return savedImage;
  };

  const handleProfilePhotoChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!isAllowedProfileImage(file)) {
      const errorMessage = "Please choose a PNG, JPG, or WEBP image.";
      setPhotoError(errorMessage);
      toast.error(errorMessage);
      return;
    }

    setUploadingPhoto(true);
    setMessage("");
    setPhotoError("");
    setImageFile(file);
    try {
      await uploadProfilePhotoFile(file);
      toast.success("Profile photo updated");
    } catch (err) {
      const errorMessage = err?.response?.data?.error || err.message || "Failed to upload profile photo";
      setPhotoError(`${errorMessage} Click Save changes to retry.`);
      setMessage(errorMessage);
      toast.error(errorMessage);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSaveChanges = async (event) => {
    event?.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const token = await getToken(true);
      if (!token) {
        throw new Error("Your session expired. Please sign in again.");
      }

      if (activeTab === "payments") {
        await axios.put(
          "/api/shipping",
          {
            paymentMethodsOnly: true,
            ...paymentMethods,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setMessage("Payment methods updated.");
        toast.success("Checkout payment methods saved");
        return;
      }

      let imageUrl = image?.trim() || "";
      if (imageFile) {
        imageUrl = await uploadProfilePhotoFile(imageFile);
      }

      const payload = {
        name,
        email,
        storeName,
        storePhone,
        storeWebsite,
        storeAddress,
        storeCity,
        storeState,
        storeZip,
        storeDescription,
        businessType,
        emailNotifications,
        twoFactorEnabled,
        currencyPreference,
        smtpSettings: {
          transactional: { ...transactionalSmtp, port: Number(transactionalSmtp.port || 465) },
          promotional: { ...promotionalSmtp, port: Number(promotionalSmtp.port || 465) },
        },
      };

      if (imageUrl) {
        payload.image = imageUrl;
      }

      const updateRes = await axios.post(
        "/api/store/profile/update",
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const savedProfile = updateRes.data?.profile;
      const savedImage = savedProfile?.image || imageUrl;
      if (savedImage) {
        setImage(savedImage);
        setImageVersion(Date.now());
      }
      if (savedProfile?.name) {
        setName(savedProfile.name);
      }
      if (savedProfile?.email) {
        setEmail(savedProfile.email);
      }

      setMessage("Settings saved successfully!");
      toast.success("Settings saved");
      setImageFile(null);
      setPhotoError("");

      if (savedImage) {
        await syncFirebaseProfilePhoto(savedImage, name);
      }
    } catch (err) {
      const errorMessage = err?.response?.data?.error || err.message;
      setMessage(errorMessage);
      if (imageFile) {
        setPhotoError(`${errorMessage} Your selected photo is still ready — try Save again.`);
      }
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) {
      toast.error("Enter an email address");
      return;
    }

    setInviteStatus("");
    setInviteSuccess(false);
    setInviteLink("");
    setInviteSending(true);

    try {
      const token = await getToken();
      const { data } = await axios.post(
        "/api/store/users/invite",
        { email: inviteEmail, permissions: invitePermissions },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (data?.emailSent === false) {
        const warningMessage = data?.warning || "Email could not be delivered.";
        setInviteLink(data?.inviteUrl || "");
        setInviteStatus(`${data?.message || "Invitation saved"}. ${warningMessage}`);
        toast.error(warningMessage);
        return;
      }

      const successMessage = data?.message || "Invitation sent successfully!";
      setInviteSuccess(true);
      setInviteStatus(successMessage);
      toast.success(successMessage);
      setInviteEmail("");
    } catch (err) {
      const errorMessage = err?.response?.data?.error || err.message || "Failed to send invitation";
      setInviteStatus(errorMessage);
      toast.error(errorMessage);
    } finally {
      setInviteSending(false);
    }
  };

  const renderSmtpBlock = (title, subtitle, value, setValue, accent) => (
    <div className={`rounded-xl border p-4 ${accent}`}>
      <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
      <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="SMTP Host">
          <input type="text" value={value.host} onChange={(e) => setValue((prev) => ({ ...prev, host: e.target.value }))} className={inputClass} placeholder="smtp.hostinger.com" />
        </Field>
        <Field label="SMTP Port">
          <input type="number" value={value.port} onChange={(e) => setValue((prev) => ({ ...prev, port: Number(e.target.value || 465) }))} className={inputClass} placeholder="465" />
        </Field>
        <Field label="SMTP User">
          <input type="text" value={value.user} onChange={(e) => setValue((prev) => ({ ...prev, user: e.target.value }))} className={inputClass} />
        </Field>
        <Field label="SMTP Password">
          <input type="password" value={value.pass} onChange={(e) => setValue((prev) => ({ ...prev, pass: e.target.value }))} className={inputClass} />
        </Field>
        <Field label="From Email">
          <input type="email" value={value.fromEmail} onChange={(e) => setValue((prev) => ({ ...prev, fromEmail: e.target.value }))} className={inputClass} />
        </Field>
        <Field label="From Name">
          <input type="text" value={value.fromName} onChange={(e) => setValue((prev) => ({ ...prev, fromName: e.target.value }))} className={inputClass} />
        </Field>
      </div>
      <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={value.secure} onChange={(e) => setValue((prev) => ({ ...prev, secure: e.target.checked }))} className="rounded border-slate-300" />
        Use secure TLS/SSL
      </label>
    </div>
  );

  const formContent = (
    <>
      {activeTab === "profile" && (
        <div className="space-y-5">
          <SettingsCard title="Profile photo" description="This image appears on your dashboard account.">
            <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <div className="relative">
                {imagePreview && !imageBroken ? (
                  <img
                    src={imagePreview}
                    alt="Profile"
                    className="h-24 w-24 rounded-2xl object-cover ring-4 ring-indigo-50"
                    referrerPolicy="no-referrer"
                    onError={() => {
                      setImageBroken(true);
                      setPhotoError("Could not load the saved photo. Please upload it again.");
                    }}
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-3xl font-bold text-white ring-4 ring-indigo-50">
                    {profileInitial}
                  </div>
                )}
                {uploadingPhoto ? (
                  <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-900/45 text-xs font-medium text-white">
                    Uploading...
                  </div>
                ) : null}
                <label className={`absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-lg transition hover:bg-slate-700 ${uploadingPhoto ? "pointer-events-none opacity-60" : "cursor-pointer"}`}>
                  <Camera size={16} />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingPhoto}
                    onChange={handleProfilePhotoChange}
                  />
                </label>
              </div>
              <div>
                <p className="text-lg font-semibold text-slate-900">{name || "Your name"}</p>
                <p className="text-sm text-slate-500">{email || "your@email.com"}</p>
                <p className="mt-2 text-xs text-slate-400">
                  PNG, JPG, or WEBP up to 5 MB. Uploads when you choose a file, or when you click Save changes.
                </p>
                {photoError ? <p className="mt-2 text-xs font-medium text-red-600">{photoError}</p> : null}
                {imageFile && !uploadingPhoto ? (
                  <p className="mt-2 text-xs font-medium text-amber-700">Photo selected — click Save changes if it did not upload automatically.</p>
                ) : null}
              </div>
            </div>
          </SettingsCard>

          <SettingsCard title="Account details">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Full name">
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
              </Field>
              <Field label="Email address">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} required />
              </Field>
            </div>
          </SettingsCard>
        </div>
      )}

      {activeTab === "store" && (
        <div className="space-y-5">
          <SettingsCard title="Store identity" description="How customers see your business.">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Store name" className="md:col-span-2">
                <input type="text" value={storeName} onChange={(e) => setStoreName(e.target.value)} className={inputClass} placeholder="Your store name" />
              </Field>
              <Field label="Business type">
                <select value={businessType} onChange={(e) => setBusinessType(e.target.value)} className={inputClass}>
                  <option value="">Select business type</option>
                  <option value="retail">Retail</option>
                  <option value="wholesale">Wholesale</option>
                  <option value="service">Service</option>
                  <option value="digital">Digital Products</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Phone number">
                <input type="tel" value={storePhone} onChange={(e) => setStorePhone(e.target.value)} className={inputClass} placeholder="+971 50 000 0000" />
              </Field>
              <Field label="Website URL" className="md:col-span-2">
                <input type="url" value={storeWebsite} onChange={(e) => setStoreWebsite(e.target.value)} className={inputClass} placeholder="https://example.com" />
              </Field>
              <Field label="Description" className="md:col-span-2">
                <textarea value={storeDescription} onChange={(e) => setStoreDescription(e.target.value)} className={`${inputClass} min-h-[96px] resize-none`} rows={3} placeholder="Tell customers about your store..." />
              </Field>
            </div>
          </SettingsCard>

          <SettingsCard title="Store address">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Street address" className="md:col-span-2">
                <input type="text" value={storeAddress} onChange={(e) => setStoreAddress(e.target.value)} className={inputClass} placeholder="123 Main Street" />
              </Field>
              <Field label="City">
                <input type="text" value={storeCity} onChange={(e) => setStoreCity(e.target.value)} className={inputClass} />
              </Field>
              <Field label="State / Emirate">
                <input type="text" value={storeState} onChange={(e) => setStoreState(e.target.value)} className={inputClass} />
              </Field>
              <Field label="ZIP / Postal code">
                <input type="text" value={storeZip} onChange={(e) => setStoreZip(e.target.value)} className={inputClass} />
              </Field>
            </div>
          </SettingsCard>
        </div>
      )}

      {activeTab === "preferences" && (
        <div className="space-y-5">
          <SettingsCard title="General preferences">
            <div className="space-y-3">
              <ToggleRow
                title="Email notifications"
                description="Receive updates about orders and promotions"
                checked={emailNotifications}
                onChange={(e) => setEmailNotifications(e.target.checked)}
              />
              <ToggleRow
                title="Two-factor authentication"
                description="Add extra security to your account"
                checked={twoFactorEnabled}
                onChange={(e) => setTwoFactorEnabled(e.target.checked)}
              />
              <Field label="Currency preference" className="mt-2">
                <select value={currencyPreference} onChange={(e) => setCurrencyPreference(e.target.value)} className={inputClass}>
                  <option value="AED">UAE Dirham (AED)</option>
                  <option value="USD">US Dollar ($)</option>
                  <option value="EUR">Euro (€)</option>
                  <option value="GBP">British Pound (£)</option>
                </select>
              </Field>
            </div>
          </SettingsCard>

          <SettingsCard title="SMTP email settings" description="Separate credentials for transactional and promotional mail.">
            <div className="space-y-4">
              {renderSmtpBlock(
                "Transactional SMTP",
                "Order confirmations, password resets, and no-reply messages.",
                transactionalSmtp,
                setTransactionalSmtp,
                "border-slate-200 bg-slate-50/40"
              )}
              {renderSmtpBlock(
                "Promotional SMTP",
                "Marketing campaigns and promotional newsletters.",
                promotionalSmtp,
                setPromotionalSmtp,
                "border-violet-100 bg-violet-50/30"
              )}
            </div>
          </SettingsCard>
        </div>
      )}

      {activeTab === "payments" && (
        <div className="space-y-5">
          <SettingsCard
            title="Checkout payment methods"
            description="Turn methods on or off for the storefront checkout. Disabled methods are hidden from customers."
          >
            {loadingPayments ? (
              <p className="text-sm text-slate-500">Loading payment settings…</p>
            ) : (
              <div className="space-y-3">
                <ToggleRow
                  title="Cash on Delivery (COD)"
                  description="Show COD as a payment option at checkout"
                  checked={paymentMethods.enableCOD}
                  onChange={(e) =>
                    setPaymentMethods((prev) => ({ ...prev, enableCOD: e.target.checked }))
                  }
                />
                <ToggleRow
                  title="Card payment"
                  description="Credit / debit card (Visa, Mastercard, Amex, Google Pay)"
                  checked={paymentMethods.enableCard}
                  onChange={(e) =>
                    setPaymentMethods((prev) => ({ ...prev, enableCard: e.target.checked }))
                  }
                />
                <ToggleRow
                  title="Tabby"
                  description="Buy now, pay later with Tabby"
                  checked={paymentMethods.enableTabby}
                  onChange={(e) =>
                    setPaymentMethods((prev) => ({ ...prev, enableTabby: e.target.checked }))
                  }
                />
                <ToggleRow
                  title="Tamara"
                  description="Buy now, pay later with Tamara"
                  checked={paymentMethods.enableTamara}
                  onChange={(e) =>
                    setPaymentMethods((prev) => ({ ...prev, enableTamara: e.target.checked }))
                  }
                />
                <p className="pt-1 text-xs text-slate-500">
                  Order-total limits for these methods are managed under{" "}
                  <Link href="/store/shipping" className="font-medium text-indigo-600 hover:underline">
                    Shipping settings
                  </Link>
                  .
                </p>
              </div>
            )}
          </SettingsCard>
        </div>
      )}
    </>
  );

  const teamContent = (
    <div className="space-y-5">
      <SettingsCard
        title="Default access for new members"
        description="Applied to email invites."
      >
        <PermissionPicker value={invitePermissions} onChange={setInvitePermissions} compact />
      </SettingsCard>

      <SettingsCard title="Invite by email" description="Send a link to join with Google or email.">
          <div className="space-y-3">
            <Field label="Team member email">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="team@yourstore.com"
                className={inputClass}
              />
            </Field>
            <button
              type="button"
              onClick={handleSendInvite}
              disabled={inviteSending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Mail size={16} />
              {inviteSending ? "Sending..." : "Send invite"}
            </button>
            {inviteStatus ? (
              <div
                className={`rounded-xl border p-3 text-sm ${
                  inviteSuccess
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-900"
                }`}
              >
                {inviteSuccess ? `✓ ${inviteStatus}` : inviteStatus}
                {inviteLink ? (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input type="text" readOnly value={inviteLink} className={`${inputClass} text-xs`} />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(inviteLink);
                        toast.success("Invite link copied");
                      }}
                      className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700"
                    >
                      Copy link
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </SettingsCard>

      <SettingsCard title="Team members" description="Edit what each invited user can see in the sidebar, or delete them to revoke access.">
        {loadingTeam ? (
          <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">Loading team members...</p>
        ) : teamMembers.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No team members yet. Invite someone above.</p>
        ) : (
          <div className="space-y-3">
            {teamMembers.map((member) => {
              const memberPerms = memberPermissions[member.id] || {};
              const enabledCount = countEnabledPermissions(memberPerms);
              const isEditing = editingMemberId === member.id;

              return (
                <div key={member.id} className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-sm font-bold text-indigo-600 ring-1 ring-slate-200">
                        {(member.name || member.username || member.email || "?")[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{member.name || member.username || member.email}</p>
                        <p className="text-xs text-slate-500">
                          {member.username ? `@${member.username}` : ""}
                          {member.username && member.email ? " · " : ""}
                          {member.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                        {enabledCount}/{SIDEBAR_ACCESS_COMPONENTS.length} areas
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${member.role === "admin" ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700"}`}>
                        {member.role || "member"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingMemberId(isEditing ? null : member.id)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        {isEditing ? "Hide" : "Edit access"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setMemberPendingDelete(member)}
                        disabled={deletingMemberId === member.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >
                        <Trash2 size={13} />
                        Delete
                      </button>
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
                      <PermissionPicker
                        value={memberPerms}
                        onChange={(next) => {
                          setMemberPermissions((prev) => ({ ...prev, [member.id]: next }));
                        }}
                        compact
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const token = await getToken();
                            await axios.post(
                              "/api/store/users/update-permissions",
                              { userId: member.id, permissions: memberPermissions[member.id] },
                              { headers: { Authorization: `Bearer ${token}` } }
                            );
                            toast.success("Permissions saved");
                            setEditingMemberId(null);
                          } catch (err) {
                            toast.error(err?.response?.data?.error || "Failed to update permissions");
                          }
                        }}
                        className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                      >
                        Save access
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </SettingsCard>
    </div>
  );

  const importContent = (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <Database size={22} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Legacy database import</h3>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Upload your old WordPress or WooCommerce SQL schema and migrate products, categories, and customers into your new store.
            </p>
            <Link
              href="/store/settings/database-import"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Open import wizard
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-8">
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 p-6 text-white shadow-lg sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200">Store dashboard</p>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Settings</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-300">
              Manage your profile, store details, email delivery, and team permissions in one place.
            </p>
          </div>
          {canManageTeamAccess ? (
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-indigo-100 ring-1 ring-white/10">
              <Shield size={14} />
              Store owner
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <nav className="rounded-2xl border border-slate-200/80 bg-white p-2 shadow-sm">
            {settingsTabs.map((tab) => {
              const meta = TAB_META[tab];
              const Icon = meta.icon;
              const active = activeTab === tab;
              const className = `mb-1 flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition last:mb-0 ${
                active ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100" : "text-slate-600 hover:bg-slate-50"
              }`;
              const content = (
                <>
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                    <Icon size={16} />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{meta.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{meta.description}</span>
                  </span>
                </>
              );
              if (tab === "history") {
                return (
                  <Link key={tab} href="/store/settings/history" className={className}>
                    {content}
                  </Link>
                );
              }
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={className}
                >
                  {content}
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 space-y-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white px-5 py-4 shadow-sm sm:px-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <activeMeta.icon size={18} />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{activeMeta.label}</h2>
                <p className="text-sm text-slate-500">{activeMeta.description}</p>
              </div>
            </div>
          </div>

          {isFormTab ? (
            <form onSubmit={handleSaveChanges} className="space-y-4">
              {formContent}
              <div className="sticky bottom-0 z-10 rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-lg backdrop-blur sm:flex sm:items-center sm:justify-between">
                <div className="min-w-0">
                  {message ? (
                    <p className={`text-sm ${message.toLowerCase().includes("success") ? "text-emerald-700" : "text-red-600"}`}>
                      {message}
                    </p>
                  ) : (
                    <p className="text-sm text-slate-500">
                      {activeTab === "payments"
                        ? "Changes apply to checkout payment methods on the storefront."
                        : "Changes apply to your store profile and preferences."}
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 sm:mt-0 sm:w-auto"
                >
                  <Save size={16} />
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          ) : null}

          {activeTab === "dashboardAccess" && canManageTeamAccess ? teamContent : null}
          {activeTab === "dataImport" ? importContent : null}
        </div>
      </div>

      {memberPendingDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                <Trash2 size={18} />
              </span>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-slate-900">Remove team member?</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Remove{" "}
                  <span className="font-semibold text-slate-900">
                    {memberPendingDelete.name || memberPendingDelete.username || memberPendingDelete.email || "this team member"}
                  </span>
                  {memberPendingDelete.email ? (
                    <>
                      {" "}
                      (<span className="text-slate-500">({memberPendingDelete.email})</span>
                    </>
                  ) : null}
                  ? They will lose dashboard access immediately.
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setMemberPendingDelete(null)}
                disabled={Boolean(deletingMemberId)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteTeamMember(memberPendingDelete)}
                disabled={Boolean(deletingMemberId)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                <Trash2 size={15} />
                {deletingMemberId === memberPendingDelete.id ? "Removing..." : "Yes, delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
