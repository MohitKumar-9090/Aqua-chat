export const presentUser = (user) => {
  if (!user) return null;
  const object = typeof user.toObject === 'function' ? user.toObject({ virtuals: true }) : user;

  return {
    ...object,
    name: object.displayName || object.name || '',
    username: object.username || '',
    phone: object.phoneNumber || object.phone || '',
    profilePicture: object.photoURL || object.profilePicture || '',
    profilePic: object.photoURL || object.profilePic || '',
    verified: Boolean(object.verified),
    lastSeen: object.lastSeen
  };
};

export const presentUsers = (users) => users.map((user) => presentUser(user));
