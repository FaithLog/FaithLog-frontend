import {pendingShepherdAttendanceApi} from './shepherdAttendanceApi';
import {shouldUseShepherdAttendanceMock} from './shepherdAttendanceEnvironment';
import {shepherdAttendanceMockApi} from './shepherdAttendanceMockApi';

export function getShepherdAttendanceRuntimeApi() {
  return shouldUseShepherdAttendanceMock() ? shepherdAttendanceMockApi : pendingShepherdAttendanceApi;
}
