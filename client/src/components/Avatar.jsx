import { memo } from 'react';

function Avatar({ user, name, image, size = 'md', online = false, statusRing = false, className = '' }) {
  const sizes = {
    sm: 'h-9 w-9 text-xs',
    md: 'h-11 w-11 text-sm',
    lg: 'h-14 w-14 text-base',
    xl: 'h-20 w-20 text-2xl'
  };
  const onlineIndicatorSizes = {
    sm: 'h-2.5 w-2.5',
    md: 'h-3 w-3',
    lg: 'h-3.5 w-3.5',
    xl: 'h-4 w-4'
  };
  const label = name || user?.displayName || user?.email || user?.phoneNumber || 'A';
  const src = image || user?.photoURL || user?.profilePic;

  const face = (
    <div
      className={`${sizes[size]} grid place-items-center overflow-hidden rounded-full bg-gradient-to-br from-cyan-400 via-aqua-300 to-cyan-300 font-bold text-white shadow-soft`}
    >
      {src ? (
        <img src={src} alt={label} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <span className="font-black">{label.charAt(0).toUpperCase()}</span>
      )}
    </div>
  );

  return (
    <div className={`relative shrink-0 ${className}`}>
      {statusRing ? (
        <div className="rounded-full bg-gradient-to-tr from-cyan-500 via-aqua-400 to-emerald-400 p-[2.5px] transition">
          {face}
        </div>
      ) : (
        face
      )}
      {online && (
        <span
          className={`${onlineIndicatorSizes[size]} absolute bottom-0 right-0 rounded-full border-2 border-white bg-emerald-400 shadow-lg shadow-emerald-200/50`}
          title="Online"
        />
      )}
    </div>
  );
}

export default memo(Avatar);
