/**
 * Siedziby firmy: każde miasto ma swoje „za i przeciw”, żeby wybór coś znaczył.
 * - localShare: jak często zlecenia startują z siedziby (klienci z okolicy znają firmę),
 * - localRate: mnożnik stawek zleceń z siedziby (konkurencja albo przemysł i porty),
 * - salaryMul: oczekiwania płacowe kierowców z lokalnego rynku pracy,
 * - landMul: ceny gruntu i budowy (rozbudowa placu, warsztat, biuro),
 * - grant: dotacja na start (regiony, które chcą przyciągnąć firmy),
 * - market: ile ofert więcej (albo mniej) wisi na giełdzie dzięki ruchowi w regionie.
 */
export interface HqProfile {
  market: number;
  localShare: number;
  localRate: number;
  salaryMul: number;
  landMul: number;
  grant: number;
  blurb: string;
}

export const HQ: Record<string, HqProfile> = {
  WAW: { market: 4, localShare: 0.18, localRate: 0.97, salaryMul: 1.06, landMul: 1.25, grant: 0, blurb: 'Najwięcej zleceń w kraju, ale konkurencja zbija stawki, kierowcy chcą stołecznych pensji, a plac kosztuje jak apartament.' },
  STR: { market: 2, localShare: 0.14, localRate: 1.0, salaryMul: 1.03, landMul: 0.95, grant: 0, blurb: 'Węzeł A1/A2 i magazyny po horyzont. Wszędzie blisko, ale magazyny podkupują kierowców. To nie miejsce, to stan umysłu.' },
  LDZ: { market: 2, localShare: 0.12, localRate: 0.98, salaryMul: 0.97, landMul: 0.85, grant: 0, blurb: 'Sam środek Polski, A1 i A2 pod nosem, ludzie tańsi niż w stolicy. Za to pełno małych przewoźników, więc stawki niższe.' },
  KRK: { market: 2, localShare: 0.12, localRate: 1.02, salaryMul: 1.04, landMul: 1.2, grant: 0, blurb: 'Dużo zleceń i turyści w korkach. Grunt drogi, smok gratis.' },
  KTW: { market: 1, localShare: 0.12, localRate: 1.05, salaryMul: 1.02, landMul: 1.0, grant: 0, blurb: 'Śląsk: przemysł płaci lepiej, ładunki ciężkie i na każdą okazję.' },
  WRO: { market: 1, localShare: 0.12, localRate: 1.03, salaryMul: 1.03, landMul: 1.1, grant: 0, blurb: 'Zachód blisko, firmy z kapitałem. Lepsze stawki, droższy plac.' },
  POZ: { market: 1, localShare: 0.12, localRate: 1.03, salaryMul: 1.02, landMul: 1.05, grant: 0, blurb: 'A2 na zachód, porządek, terminowi klienci i rogale świętomarcińskie.' },
  GDN: { market: 1, localShare: 0.1, localRate: 1.06, salaryMul: 1.03, landMul: 1.1, grant: 0, blurb: 'Port: kontenery płacą dobrze, ale do południa kraju daleko.' },
  SZZ: { market: -1, localShare: 0.08, localRate: 1.05, salaryMul: 0.97, landMul: 0.85, grant: 3000, blurb: 'Port na rogu mapy. Mniej zleceń w kraju, za to tani grunt i mała dotacja.' },
  BYD: { market: -1, localShare: 0.08, localRate: 1.0, salaryMul: 0.95, landMul: 0.8, grant: 2000, blurb: 'Kujawy: spokojnie, tańsi ludzie i tani plac.' },
  LUB: { market: -1, localShare: 0.06, localRate: 1.0, salaryMul: 0.92, landMul: 0.75, grant: 6000, blurb: 'Wschód: tani ludzie i grunt, dotacja z urzędu, ale daleko do wszystkiego.' },
  BIA: { market: -3, localShare: 0.05, localRate: 0.98, salaryMul: 0.92, landMul: 0.75, grant: 6000, blurb: 'Podlasie: najtańsza siła robocza i spora dotacja. W zamian żubry i długie dojazdy na pusto.' },
  RZE: { market: -1, localShare: 0.06, localRate: 1.0, salaryMul: 0.92, landMul: 0.75, grant: 6000, blurb: 'Podkarpacie: tanio, dotacja, mało konkurencji, ale zleceń też mało.' },
};

export const DEFAULT_HQ = 'WAW';
export const hqProfile = (id: string | undefined) => HQ[id ?? DEFAULT_HQ] ?? HQ[DEFAULT_HQ];
