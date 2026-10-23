import Image from 'next/image';
export type MarketAd={id:string;placement:'premium'|'secondary'|'tertiary';advertiser_name:string;headline:string;target_url:string;image_url:string};
export function MarketAdSlot({ads,placement}:{ads:MarketAd[];placement:MarketAd['placement']}){
 const ad=ads.find(item=>item.placement===placement);if(!ad)return null;
 return <aside className={`market-ad market-ad-${placement}`} aria-label={`Publicidade de ${ad.advertiser_name}`}><span className="market-ad-label">Publicidade</span><a href={ad.target_url} target="_blank" rel="noopener noreferrer sponsored" aria-label={`${ad.headline} — publicidade de ${ad.advertiser_name} (abre noutra janela)`}><Image src={ad.image_url} alt="" width={1200} height={350} sizes={placement==='secondary'?'(max-width: 767px) 100vw, 250px':'100vw'} unoptimized/><span className="market-ad-copy"><b>{ad.headline}</b><small>{ad.advertiser_name} ↗</small></span></a></aside>;
}
