import React, { useState } from 'react';

interface UserAvatarProps {
  user?: {
    fullName?: string;
    avatarUrl?: string;
    avatarScale?: number;
    avatarX?: number;
    avatarY?: number;
  } | null;
  className?: string; // e.g. "w-9 h-9"
  fallbackText?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({ 
  user, 
  className = "w-9 h-9",
  fallbackText = ""
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const fullName = user?.fullName || fallbackText || "Пользователь";
  const avatarUrl = user?.avatarUrl;

  const initials = fullName
    .trim()
    .split(/\s+/)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

  // Generate a distinct color index based on the full name string
  let sum = 0;
  for (let i = 0; i < fullName.length; i++) {
    sum += fullName.charCodeAt(i);
  }
  const colorIndex = sum % 6;
  const gradientColors = [
    "from-indigo-500 to-purple-600 text-white",
    "from-emerald-550 to-teal-600 text-white",
    "from-amber-500 to-orange-600 text-white",
    "from-rose-500 to-pink-600 text-white",
    "from-sky-500 to-blue-600 text-white",
    "from-violet-500 to-fuchsia-600 text-white",
  ][colorIndex];

  const hasValidUrl = avatarUrl && avatarUrl.trim() !== "";

  // Find if className contains shape override, default of rounded-xl
  const hasRounded = className.includes("rounded-");
  const shapeClass = hasRounded ? "" : "rounded-xl";

  if (hasValidUrl && !imgFailed) {
    return (
      <div className={`${className} overflow-hidden shrink-0 relative ${shapeClass}`}>
        <img
          src={avatarUrl}
          alt={fullName}
          className="w-full h-full object-cover origin-center select-none"
          style={{
            transform: `scale(${user?.avatarScale ?? 1}) translate(${user?.avatarX ?? 0}px, ${user?.avatarY ?? 0}px)`,
          }}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className={`${className} bg-gradient-to-tr ${gradientColors} flex items-center justify-center font-bold text-xs tracking-wide shadow-sm select-none uppercase border border-white/10 shrink-0 ${shapeClass}`}>
      {initials}
    </div>
  );
};
