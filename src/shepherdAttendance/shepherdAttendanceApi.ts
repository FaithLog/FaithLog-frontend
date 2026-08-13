import {FaithLogApiError} from '../api/apiError';
import {apiRequest, toPositiveIntegerPathSegment} from '../api/client';
import {
  parseAdminAttendancePage,
  parseGroupResource,
  parseGroupResources,
  parseReport,
  parseShepherdHome,
} from './shepherdAttendanceDomain';
import type {
  AdminAttendancePage,
  AttendanceSaveRequest,
  ShepherdAttendanceHome,
  ShepherdAttendanceReport,
  ShepherdGroupResource,
} from './shepherdAttendanceTypes';

type RequestOptions<T> = {
  accessToken: string;
  body?: unknown;
  method: 'GET' | 'PATCH' | 'POST' | 'PUT';
  responseParser?: (value: unknown) => T;
};
export type ShepherdAttendanceRequest = <T>(path: string, options: RequestOptions<T>) => Promise<T>;
export type ShepherdAttendanceContractStatus = 'confirmed' | 'confirmed-test' | 'pending';
export type ShepherdAttendanceApi = {
  getHome(token: string, campusId: number): Promise<ShepherdAttendanceHome>;
  getMyGroups(token: string, campusId: number): Promise<ShepherdGroupResource[]>;
  getMyReport(token: string, campusId: number, groupId: number, serviceDate: string): Promise<ShepherdAttendanceReport>;
  saveMyReport(token: string, campusId: number, groupId: number, serviceDate: string, body: AttendanceSaveRequest): Promise<ShepherdAttendanceReport>;
  createGroup(token: string, campusId: number, body: {name: string; assigneeUserIds?: number[]}): Promise<ShepherdGroupResource>;
  getAdminGroups(token: string, campusId: number): Promise<ShepherdGroupResource[]>;
  updateGroup(token: string, campusId: number, groupId: number, body: {name: string; version: number}): Promise<ShepherdGroupResource>;
  getAdminPage(token: string, campusId: number, serviceDate: string, page?: number, size?: number): Promise<AdminAttendancePage>;
  saveAdminReport(token: string, campusId: number, groupId: number, serviceDate: string, body: AttendanceSaveRequest): Promise<ShepherdAttendanceReport>;
  updateAssignees(token: string, campusId: number, groupId: number, assigneeUserIds: number[]): Promise<ShepherdGroupResource>;
};

export function createShepherdAttendanceApi({contractStatus, request}: {contractStatus: ShepherdAttendanceContractStatus; request: ShepherdAttendanceRequest}): ShepherdAttendanceApi {
  const assertConfirmed = () => {
    if (contractStatus === 'pending') throw new FaithLogApiError({kind: 'error', code: 'API_CONTRACT_PENDING', message: '목홀타 기능을 준비하고 있습니다.'});
  };
  const ids = (campusId: number, groupId?: number) => ({campusId: toPositiveIntegerPathSegment(campusId, 'campusId'), ...(groupId === undefined ? {} : {groupId: toPositiveIntegerPathSegment(groupId, 'groupId')})});
  return {
    async getHome(token, campusId) {
      assertConfirmed(); const value = ids(campusId);
      return request(`/api/v1/campuses/${value.campusId}/shepherd-attendance/me/home`, {accessToken: token, method: 'GET', responseParser: parseShepherdHome});
    },
    async getMyGroups(token, campusId) {
      assertConfirmed(); const value = ids(campusId);
      return request(`/api/v1/campuses/${value.campusId}/shepherd-groups/me`, {accessToken: token, method: 'GET', responseParser: (raw) => parseGroupResources(raw, campusId)});
    },
    async getMyReport(token, campusId, groupId, serviceDate) {
      assertConfirmed(); const value = ids(campusId, groupId); validateSunday(serviceDate);
      return request(`/api/v1/campuses/${value.campusId}/shepherd-groups/${value.groupId}/attendance/${serviceDate}`, {accessToken: token, method: 'GET', responseParser: (raw) => parseReport(raw, {campusId, groupId, serviceDate})});
    },
    async saveMyReport(token, campusId, groupId, serviceDate, body) {
      assertConfirmed(); const value = ids(campusId, groupId); validateSunday(serviceDate);
      return request(`/api/v1/campuses/${value.campusId}/shepherd-groups/${value.groupId}/attendance/${serviceDate}`, {accessToken: token, body, method: 'PUT', responseParser: (raw) => parseReport(raw, {campusId, groupId, serviceDate})});
    },
    async createGroup(token, campusId, body) {
      assertConfirmed(); const value = ids(campusId);
      validateGroupName(body.name);
      if (body.assigneeUserIds !== undefined) validateAssigneeIds(body.assigneeUserIds, true);
      return request(`/api/v1/campuses/${value.campusId}/shepherd-groups`, {accessToken: token, body, method: 'POST', responseParser: (raw) => parseGroupResource(raw, campusId)});
    },
    async getAdminGroups(token, campusId) {
      assertConfirmed(); const value = ids(campusId);
      return request(`/api/v1/admin/campuses/${value.campusId}/shepherd-groups`, {accessToken: token, method: 'GET', responseParser: (raw) => parseGroupResources(raw, campusId)});
    },
    async updateGroup(token, campusId, groupId, body) {
      assertConfirmed(); const value = ids(campusId, groupId);
      validateGroupName(body.name);
      if (!Number.isSafeInteger(body.version) || body.version < 1) invalidRequest();
      return request(`/api/v1/admin/campuses/${value.campusId}/shepherd-groups/${value.groupId}`, {accessToken: token, body, method: 'PATCH', responseParser: (raw) => parseGroupResource(raw, campusId)});
    },
    async getAdminPage(token, campusId, serviceDate, page = 0, size = 50) {
      assertConfirmed(); const value = ids(campusId); validateSunday(serviceDate);
      if (!Number.isSafeInteger(page) || page < 0 || !Number.isSafeInteger(size) || size < 1 || size > 100) invalidRequest();
      return request(`/api/v1/admin/campuses/${value.campusId}/shepherd-attendance?serviceDate=${serviceDate}&page=${page}&size=${size}`, {accessToken: token, method: 'GET', responseParser: (raw) => parseAdminAttendancePage(raw, {campusId, page, size, serviceDate})});
    },
    async saveAdminReport(token, campusId, groupId, serviceDate, body) {
      assertConfirmed(); const value = ids(campusId, groupId); validateSunday(serviceDate);
      return request(`/api/v1/admin/campuses/${value.campusId}/shepherd-groups/${value.groupId}/attendance/${serviceDate}`, {accessToken: token, body, method: 'PUT', responseParser: (raw) => parseReport(raw, {campusId, groupId, serviceDate})});
    },
    async updateAssignees(token, campusId, groupId, assigneeUserIds) {
      assertConfirmed(); const value = ids(campusId, groupId);
      validateAssigneeIds(assigneeUserIds, false);
      return request(`/api/v1/admin/campuses/${value.campusId}/shepherd-groups/${value.groupId}/assignees`, {accessToken: token, body: {assigneeUserIds}, method: 'PUT', responseParser: (raw) => parseGroupResource(raw, campusId)});
    },
  };
}

function validateSunday(value: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T12:00:00+09:00`).getDay() !== 0) invalidRequest(); }
function validateGroupName(value: string) { if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 100) invalidRequest(); }
function validateAssigneeIds(value: number[], allowEmpty: boolean) { if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || new Set(value).size !== value.length || value.some((id) => !Number.isSafeInteger(id) || id <= 0)) invalidRequest(); }
function invalidRequest(): never { throw new FaithLogApiError({kind: 'error', code: 'INVALID_REQUEST', message: '입력값을 확인해 주세요.'}); }

const productionRequest = ((path, options) => (apiRequest as unknown as ShepherdAttendanceRequest)(path, options)) as ShepherdAttendanceRequest;

export const confirmedShepherdAttendanceApi = createShepherdAttendanceApi({
  contractStatus: 'confirmed',
  request: productionRequest,
});

export const pendingShepherdAttendanceApi = createShepherdAttendanceApi({
  contractStatus: 'pending',
  request: productionRequest,
});
