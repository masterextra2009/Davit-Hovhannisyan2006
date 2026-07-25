import React, { useState } from 'react';
import { UserRound } from 'lucide-react';

interface UserAvatarProps {
  user?: {
    fullName?: string;
    avatarUrl?: string;
  } | null;
  className?: string; // e.g. "w-9 h-9"
  fallbackText?: string;
}

// Мужские имена, оканчивающиеся на "а"/"я" (по умолчанию эти окончания
// считаются женскими для русских имён) — короткий список самых частых
// исключений. Это декоративная эвристика для выбора цвета аватарки, а не
// что-то, влияющее на данные, так что не страшно, если она иногда ошибается
// на редких/нерусских именах.
const MALE_NAME_EXCEPTIONS = new Set([
  'никита', 'илья', 'кузьма', 'фома', 'лука', 'данила', 'дима', 'миша',
  'гоша', 'гриша', 'вова', 'стёпа', 'степа', 'слава', 'юра',
]);

function guessGenderFromName(fullName: string): 'male' | 'female' {
  const firstName = fullName.trim().split(/\s+/)[0]?.toLowerCase() || '';
  if (MALE_NAME_EXCEPTIONS.has(firstName)) return 'male';
  if (/[ая]$/.test(firstName)) return 'female';
  return 'male';
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  user,
  className = "w-9 h-9",
  fallbackText = ""
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const fullName = user?.fullName || fallbackText || "Пользователь";
  const avatarUrl = user?.avatarUrl;

  // Generate a distinct color index based on the full name string
  let sum = 0;
  for (let i = 0; i < fullName.length; i++) {
    sum += fullName.charCodeAt(i);
  }
  const gender = guessGenderFromName(fullName);
  const palette = gender === 'female'
    ? ["from-rose-500 to-pink-600", "from-fuchsia-500 to-purple-600", "from-violet-500 to-indigo-600"]
    : ["from-sky-500 to-blue-600", "from-indigo-500 to-blue-700", "from-teal-500 to-emerald-600"];
  const gradientColors = `${palette[sum % palette.length]} text-white`;

  const hasValidUrl = avatarUrl && avatarUrl.trim() !== "";

  // Find if className contains shape override, default of rounded-xl
  const hasRounded = className.includes("rounded-");
  const shapeClass = hasRounded ? "" : "rounded-xl";

  if (hasValidUrl && !imgFailed) {
    return (
      <div className={`${className} overflow-hidden shrink-0 relative bg-slate-100 dark:bg-slate-800 ${shapeClass}`}>
        <img
          src={avatarUrl}
          alt={fullName}
          loading="lazy"
          className="w-full h-full object-cover select-none"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className={`${className} bg-gradient-to-tr ${gradientColors} flex items-center justify-center shadow-sm select-none border border-white/10 shrink-0 ${shapeClass}`}>
      <UserRound className="w-[60%] h-[60%]" strokeWidth={2} />
    </div>
  );
};
