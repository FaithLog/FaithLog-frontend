import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {describe, expect, it} from 'vitest';

const directory = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(directory, 'AdminScreen.tsx'), 'utf8');

describe('admin member duty production layout', () => {
  it('puts the meal duty page next to the coffee duty page', () => {
    expect(source).toMatch(/id: 'coffee', label: '커피담당'[\s\S]*id: 'meal', label: '밥담당'/);
    expect(source).toContain('<AdminMealDutyManagement');
  });

  it('bounds and memoizes coffee and meal duty rows without nesting a virtualized list', () => {
    expect(source).toContain('MemoizedCoffeeDutyMemberRow');
    expect(source).toContain('MemoizedMealDutyMemberRow');
    expect(source).toContain('accessibilityLabel="커피 담당 멤버 더 보기"');
    expect(source).toContain('accessibilityLabel="밥 담당 멤버 더 보기"');
    const coffeePage = source.slice(source.indexOf('function AdminCoffeeDutyManagement'), source.indexOf('function AdminMealDutyManagement'));
    const mealPage = source.slice(source.indexOf('function AdminMealDutyManagement'), source.indexOf('function InviteCodeCopyRow'));
    expect(coffeePage).not.toContain('<FlatList');
    expect(mealPage).not.toContain('<FlatList');
  });

  it('passes active duty assignments to both the route-level list and regular member list', () => {
    expect(source).toMatch(/<AdminMemberListRoute[\s\S]*duties=\{loadState\.duties\}/);
    expect(source).toMatch(/<AdminMemberPage[\s\S]*activeMealDuties=\{activeMealDuties\}/);
    expect(source).toMatch(/<AdminMemberPage[\s\S]*activeCoffeeDuties=\{activeCoffeeDuties\}/);
  });

  it('renders coffee duty as a multi-assignment list like meal duty', () => {
    expect(source).toContain('getActiveCoffeeDuties(loadState.duties)');
    expect(source).toContain('activeCoffeeDuties.map((assignment) => [assignment.userId, assignment])');
    expect(source).toContain('활성 담당자 {activeCoffeeDuties.length}명');
    expect(source).not.toContain('새 담당자를 지정하면 기존 배정은 inactive 처리됩니다.');
  });

  it('uses neutral empty copy for role and duty filters', () => {
    expect(source.match(/다른 필터를 선택해 주세요\./g)).toHaveLength(2);
    expect(source).not.toContain('다른 역할 필터를 선택해 주세요.');
  });

  it('binds the production admin load to the committed campus and request identity', () => {
    expect(source).toContain('createAdminLoadCoordinator(campusId)');
    expect(source).toContain('commitAdminLoadCampus(adminLoadCoordinatorRef.current, campusId)');
    expect(source).toContain('isCurrentAdminLoad(loadIdentity)');
    expect(source).toContain('assertAdminDutyAssignmentsForCampus(duties, members, operationCampusId)');
  });

  it('routes both MEAL assign and revoke refreshes through the validated production boundary', () => {
    const assignFlow = source.slice(source.indexOf('const assignMeal ='), source.indexOf('const revokeMeal ='));
    const revokeFlow = source.slice(source.indexOf('const revokeMeal ='), source.indexOf('const confirmDeleteMember ='));

    expect(assignFlow).toContain('refreshMealDutyAdminState(operationId, operationCampusId)');
    expect(revokeFlow).toContain('refreshMealDutyAdminState(operationId, operationCampusId)');
    expect(source).toContain('coordinateAdminMealDutyRefresh({');
  });
});
