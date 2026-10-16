export type ManualCoffeeOption = {content: string; priceAmount: number};
export const MAX_COFFEE_PRICE = 2_147_483_647;

export function getManualCoffeeOptionError(content: string, priceText: string, existingNames: string[] = []): string | null {
  const name = content.trim();
  if (!name) return '메뉴 이름을 입력해 주세요.';
  if (name.length > 200) return '메뉴 이름은 200자 이내로 입력해 주세요.';
  if (existingNames.some((existing) => existing.trim().toLowerCase() === name.toLowerCase())) {
    return '이미 추가된 항목입니다.';
  }
  const price = Number(priceText.trim());
  if (!/^\d+$/.test(priceText.trim()) || !Number.isSafeInteger(price) || price <= 0) {
    return '금액은 1원 이상의 정수로 입력해 주세요.';
  }
  if (price > MAX_COFFEE_PRICE) return '입력할 수 있는 금액을 초과했습니다.';
  return null;
}

export function createManualCoffeeOption(content: string, priceText: string): ManualCoffeeOption {
  const error = getManualCoffeeOptionError(content, priceText);
  if (error) throw new Error(error);
  return {content: content.trim(), priceAmount: Number(priceText.trim())};
}
