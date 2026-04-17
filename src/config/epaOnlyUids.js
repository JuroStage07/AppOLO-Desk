// Usuarios EPA que deben ver SOLO el módulo EPA en Home.
// Regla: se aplica únicamente si además `profile.epaAdmin === true`.

export const EPA_ONLY_UIDS = [
  "beQG1WhruaSOh7ESMw3fR2Juady1", // planificacion7@cr.epa.biz
  "d2vQpKEKqddHDeTysL4xHpo1Y6i2", // planificacion8@cr.epa.biz
  "suyzshXjTvawM9D7tCcYZJccdWE2", // planificacion9@cr.epa.biz
  "jMcqW17fV5UXhjvkzBVOxC1T37g2", // trafico1@cr.epa.biz
  "Vk2pkj0P1BQdlSq40wTFkIlXdP92", // trafico2@cr.epa.biz
  "z71HoeBaHhXMXyttcSdJOYy7hIE3", // trafico3@cr.epa.biz
  "zwXAY0V2vufZffqaWncCJ7aohYo2", // trafico4@cr.epa.biz
  "MVGlt7S1ZJSuEuoMrVuroquCAqm1", // trafico@cr.epa.biz
  "5IHaK95b2fONDMVtiZ58g5MDgFp1", // jefedeplanificacionimportados@cr.epa.biz
  "ALmZYdFbcoV4lIXm5WxuZsQl8Iz2", // importaciones@cr.epa.biz
  "ALmZYdfbcoV4lIXm5WxuZsQl8Iz2", // importaciones (variante mayúsc/minúsc en uid)
];

const EPA_ONLY_UIDS_SET = new Set(EPA_ONLY_UIDS);

export function isEpaOnlyUid(uid) {
  return EPA_ONLY_UIDS_SET.has(String(uid || "").trim());
}

/** Misma regla que Home “solo EPA”: epaAdmin + uid en whitelist. */
export function isEpaRestrictedUser({ epaAdmin, profile, user }) {
  const uid = String(profile?.id || profile?.uid || user?.uid || "").trim();
  return epaAdmin === true && isEpaOnlyUid(uid);
}

