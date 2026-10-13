// Local format checks only: never fetch product URLs or send content to another service.
export function validateWishlist(input,email) {
  const wishlist=typeof input.wishlist==='string'?input.wishlist.trim():'';
  const message=typeof input.message==='string'?input.message.trim():'';
  const gifts=input.gifts;
  const list=Array.isArray(gifts)?gifts:[];
  const submitted=Boolean(wishlist || list.some(g=>g &&
    ((typeof g.label==='string' && g.label.trim()) || (typeof g.url==='string' && g.url.trim()))));
  const lengths=typeof input.wishlist==='string' && wishlist.length<=5000 &&
    (input.message===undefined || typeof input.message==='string') && message.length<=2000 &&
    Array.isArray(gifts) && list.length<=5 && list.every(g=>g && typeof g.label==='string' && typeof g.url==='string' && g.label.length<=160 && g.url.length<=2000);
  const links=list.every(g=>{
    if(!g || typeof g.url!=='string')return false;
    if(!g.url.trim())return true;
    try {const url=new URL(g.url.trim());return ['http:','https:'].includes(url.protocol) && !url.username && !url.password;}
    catch{return false;}
  });
  const checks=[
    {key:'email',label:'Valid member email',passed:typeof email==='string' && email.length<=254 && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)},
    {key:'ideas',label:'Wish list or gift idea included',passed:submitted},
    {key:'lengths',label:'Text and gift limits met',passed:lengths},
    {key:'links',label:'Product link format valid',passed:links},
  ];
  const explanations={email:'Ask the organizer to correct your email address.',ideas:'Add a wish list or at least one gift idea.',
    lengths:'Use up to 5 gifts, 5,000 wish-list characters, 2,000 message characters, 160-character gift names, and 2,000-character links.',
    links:'Product links must be valid http(s) URLs without credentials.'};
  return {submitted,passed:checks.every(c=>c.passed),checks,issues:checks.filter(c=>!c.passed).map(c=>explanations[c.key])};
}

export function checkedWishlist(input,email) {
  const value={wishlist:input.wishlist,message:input.message ?? '',gifts:input.gifts ?? []};
  const validation=validateWishlist(value,email);
  if(!validation.passed)throw new Error(validation.issues.join(' '));
  return {wishlist:value.wishlist.trim(),message:value.message.trim(),
    gifts:value.gifts.map(g=>({label:g.label.trim(),url:g.url.trim()})).filter(g=>g.label || g.url)};
}
