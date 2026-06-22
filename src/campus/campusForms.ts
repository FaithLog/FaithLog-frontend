import type {CampusCreateRequest, CampusJoinRequest} from '../api/types';
import type {AuthFieldErrors} from '../auth/authForms';

export type InviteCodeFormValues = CampusJoinRequest;
export type CampusCreateFormValues = CampusCreateRequest;

const INVITE_CODE_PATTERN = /^[A-Z0-9-]+$/;
const MIN_INVITE_CODE_LENGTH = 4;
const MAX_INVITE_CODE_LENGTH = 40;
const MAX_CAMPUS_NAME_LENGTH = 50;
const MAX_REGION_LENGTH = 50;
const MAX_DESCRIPTION_LENGTH = 200;

export function validateInviteCodeForm(values: InviteCodeFormValues) {
  const fieldErrors: AuthFieldErrors<keyof InviteCodeFormValues> = {};
  const inviteCode = values.inviteCode.trim().toUpperCase();

  if (!inviteCode) {
    fieldErrors.inviteCode = '초대코드를 입력해 주세요.';
  } else if (
    inviteCode.length < MIN_INVITE_CODE_LENGTH ||
    inviteCode.length > MAX_INVITE_CODE_LENGTH ||
    !INVITE_CODE_PATTERN.test(inviteCode)
  ) {
    fieldErrors.inviteCode = '초대코드는 영문 대문자, 숫자, 하이픈으로 입력해 주세요.';
  }

  return {
    fieldErrors,
    payload: {inviteCode},
    valid: Object.keys(fieldErrors).length === 0,
  };
}

export function validateCampusCreateForm(values: CampusCreateFormValues) {
  const fieldErrors: AuthFieldErrors<keyof CampusCreateFormValues> = {};
  const name = values.name.trim();
  const region = values.region.trim();
  const description = values.description.trim();

  if (!name) {
    fieldErrors.name = '캠퍼스 이름을 입력해 주세요.';
  } else if (name.length > MAX_CAMPUS_NAME_LENGTH) {
    fieldErrors.name = `캠퍼스 이름은 ${MAX_CAMPUS_NAME_LENGTH}자 이하로 입력해 주세요.`;
  }

  if (!region) {
    fieldErrors.region = '지역을 입력해 주세요.';
  } else if (region.length > MAX_REGION_LENGTH) {
    fieldErrors.region = `지역은 ${MAX_REGION_LENGTH}자 이하로 입력해 주세요.`;
  }

  if (!description) {
    fieldErrors.description = '설명을 입력해 주세요.';
  } else if (description.length > MAX_DESCRIPTION_LENGTH) {
    fieldErrors.description = `설명은 ${MAX_DESCRIPTION_LENGTH}자 이하로 입력해 주세요.`;
  }

  return {
    fieldErrors,
    payload: {name, region, description},
    valid: Object.keys(fieldErrors).length === 0,
  };
}
