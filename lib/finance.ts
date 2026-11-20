import { getDefaultReportRange } from "@/lib/erp-api";
import type { AccountBalance, DateRangeFilter, ErpData, JournalEntry } from "@/types/erp";

export const DEFAULT_REPORT_RANGE: DateRangeFilter = getDefaultReportRange();

function endOfDay(date: string) {
  return Date.parse(`${date}T23:59:59.999Z`);
}

function startOfDay(date: string) {
  return Date.parse(`${date}T00:00:00.000Z`);
}

export function isValidDateRange(range: DateRangeFilter) {
  return Number.isFinite(startOfDay(range.startDate)) && Number.isFinite(endOfDay(range.endDate)) && startOfDay(range.startDate) <= endOfDay(range.endDate);
}

export function timestampWithinRange(timestamp: string, range: DateRangeFilter) {
  const value = Date.parse(timestamp);
  return value >= startOfDay(range.startDate) && value <= endOfDay(range.endDate);
}

export function journalWithinRange(entry: JournalEntry, range: DateRangeFilter) {
  return timestampWithinRange(entry.timestamp, range);
}

export function postedEntriesUntil(data: ErpData, endDate: string) {
  const cutoff = endOfDay(endDate);
  return data.journalEntries.filter((entry) => entry.status === "Posted" && Date.parse(entry.timestamp) <= cutoff);
}

export function calculateAccountBalances(data: ErpData, endDate: string): AccountBalance[] {
  const entries = postedEntriesUntil(data, endDate);
  return data.accounts.map((account) => {
    const lines = entries.flatMap((entry) => entry.lines).filter((line) => line.accountId === account.id);
    const debitMinor = lines.reduce((sum, line) => sum + line.debitMinor, 0);
    const creditMinor = lines.reduce((sum, line) => sum + line.creditMinor, 0);
    return { account, debitMinor, creditMinor, balanceMinor: account.normalBalance === "Debit" ? debitMinor - creditMinor : creditMinor - debitMinor };
  });
}

function groupBalance(balances: AccountBalance[], group: string) {
  return balances.filter((item) => item.account.group === group).reduce((sum, item) => sum + item.balanceMinor, 0);
}

function accountBalance(balances: AccountBalance[], accountId: string) {
  return balances.find((item) => item.account.id === accountId)?.balanceMinor ?? 0;
}

export function buildFinancialStatements(data: ErpData, range: DateRangeFilter) {
  if (!isValidDateRange(range)) throw new Error("Start date must be on or before end date.");
  const trialBalance = calculateAccountBalances(data, range.endDate);
  const periodEntries = data.journalEntries.filter((entry) => entry.status === "Posted" && journalWithinRange(entry, range));
  const periodData = { ...data, journalEntries: periodEntries };
  const periodBalances = calculateAccountBalances(periodData, range.endDate);
  const revenueMinor = groupBalance(periodBalances, "Revenue");
  const cogsMinor = groupBalance(periodBalances, "COGS");
  const shrinkageMinor = accountBalance(periodBalances, "acc-shrinkage");
  const totalExpensesMinor = groupBalance(periodBalances, "Expenses");
  const operatingExpensesMinor = totalExpensesMinor - shrinkageMinor;
  const grossProfitMinor = revenueMinor - cogsMinor;
  const netProfitMinor = grossProfitMinor - totalExpensesMinor;
  const allTimeBalances = calculateAccountBalances(data, range.endDate);
  const allTimeRevenueMinor = groupBalance(allTimeBalances, "Revenue");
  const allTimeCogsMinor = groupBalance(allTimeBalances, "COGS");
  const allTimeExpensesMinor = groupBalance(allTimeBalances, "Expenses");
  const currentEarningsMinor = allTimeRevenueMinor - allTimeCogsMinor - allTimeExpensesMinor;
  const assetsMinor = groupBalance(trialBalance, "Assets");
  const liabilitiesMinor = groupBalance(trialBalance, "Liabilities");
  const ledgerEquityMinor = groupBalance(trialBalance, "Equity");
  const equityMinor = ledgerEquityMinor + currentEarningsMinor;
  return {
    trialBalance,
    periodEntries,
    revenueMinor,
    cogsMinor,
    grossProfitMinor,
    operatingExpensesMinor,
    shrinkageMinor,
    totalExpensesMinor,
    netProfitMinor,
    assetsMinor,
    liabilitiesMinor,
    ledgerEquityMinor,
    currentEarningsMinor,
    equityMinor,
    liabilitiesAndEquityMinor: liabilitiesMinor + equityMinor,
    balanceSheetVarianceMinor: assetsMinor - liabilitiesMinor - equityMinor,
  };
}

export type FinancialStatements = ReturnType<typeof buildFinancialStatements>;
