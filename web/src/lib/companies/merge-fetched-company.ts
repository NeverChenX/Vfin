import type { CompanyFinancials } from '@/types/finance';

export function mergeFetchedCompany(
  fetched: CompanyFinancials,
  existing: Partial<CompanyFinancials> | null | undefined,
): CompanyFinancials {
  return {
    ...fetched,
    nameEn: existing?.nameEn ?? fetched.nameEn,
    shortName: existing?.shortName ?? fetched.shortName,
    ratios: existing?.ratios ?? fetched.ratios,
    valuation: existing?.valuation ?? fetched.valuation,
  };
}

export function assertCuratedFieldsPreserved(
  existing: Partial<CompanyFinancials> | null | undefined,
  next: Partial<CompanyFinancials>,
): void {
  const dropped: string[] = [];
  if (existing?.valuation && !next.valuation) dropped.push('valuation');
  if (existing?.ratios && existing.ratios.length > 0 && (!next.ratios || next.ratios.length === 0)) {
    dropped.push('ratios');
  }
  if (dropped.length > 0) {
    throw new Error(
      `Refusing to overwrite company JSON because curated field(s) would be dropped: ${dropped.join(', ')}`,
    );
  }
}
