"""Seed only the disposable CI PostgreSQL database; never production."""
import datetime as dt
import json
import os
import subprocess
from zoneinfo import ZoneInfo

if os.environ.get('PGHOST') != '127.0.0.1' or os.environ.get('PGDATABASE') != 'faithlog_companion_qa':
    raise SystemExit('Only the isolated loopback QA database is allowed')

def sql(statement):
    return subprocess.check_output(['psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', statement], text=True).strip().splitlines()[0]

sql('CREATE EXTENSION IF NOT EXISTS pgcrypto')
fixtures = []
for index in range(6):
    email = f'companion-qa-{index}@example.test'
    user = int(sql(f"INSERT INTO users(name,email,password_hash,role,is_active,token_version,created_at,updated_at) VALUES('QA','{email}',crypt('test-only-password',gen_salt('bf',10)),'USER',true,0,now(),now()) RETURNING id"))
    campus = int(sql(f"INSERT INTO campuses(name,invite_code,is_active,created_at,updated_at) VALUES('QA','companion-qa-{index}',true,now(),now()) RETURNING id"))
    sql(f"INSERT INTO campus_members(campus_id,user_id,campus_role,status,joined_at,created_at,updated_at) VALUES({campus},{user},'MEMBER','ACTIVE','2025-01-01',now(),now())")
    fixtures.append(dict(user=user, campus=campus, email=email))
visitor, owner = fixtures[4:6]
sql(f"INSERT INTO campus_members(campus_id,user_id,campus_role,status,joined_at,created_at,updated_at) VALUES({owner['campus']},{visitor['user']},'MEMBER','ACTIVE',now(),now(),now())")
sql(f"INSERT INTO user_companions(user_id,design_id,quantity,acquired_at) VALUES({owner['user']},'david-lamb:base',1,now())")
sql(f"UPDATE companion_instances SET satiety=40,cleanliness=40 WHERE user_id={owner['user']}")
first = fixtures[0]
for fixture in fixtures:
    assert sql(f"SELECT balance FROM point_wallets WHERE user_id={fixture['user']}") == '1000', 'V32 starter grant required'
    assert sql(f"SELECT count(*) FROM point_transactions WHERE user_id={fixture['user']} AND business_key='welcome:initial-1000:v1'") == '1', 'Exactly one starter grant required'
sql(f"INSERT INTO user_companions(user_id,design_id,quantity,acquired_at) VALUES({first['user']},'david-lamb:base',3,now())")
sql(f"INSERT INTO user_backgrounds(user_id,background_id,acquired_at) VALUES({first['user']},'meadow',now())")
# Account #3 has two UUID-distinct pets of the same design. One is eligible
# for evolution, seeded directly only into this disposable PostgreSQL database.
third = fixtures[2]
sql(f"INSERT INTO user_companions(user_id,design_id,quantity,acquired_at) VALUES({third['user']},'david-lamb:base',2,now())")
sql(f"UPDATE companion_instances SET growth_xp=300,total_earned_xp=300,"
    f"care_days=3,health=90,satiety=90,cleanliness=90 "
    f"WHERE id=(SELECT id FROM companion_instances WHERE user_id={third['user']} "
    f"AND design_id='david-lamb:base' ORDER BY acquired_at,id LIMIT 1)")
assert sql(f"SELECT count(*) FROM companion_instances WHERE user_id={third['user']} AND design_id='david-lamb:base'") == '2', 'Two owned instances required'
assert sql(f"SELECT count(*) FROM companion_instances WHERE user_id={third['user']} AND growth_xp=300") == '1', 'One evolution-ready pet required'

# A separate pet meets both thresholds so this flow does not depend on the care test.
fourth = fixtures[3]
sql(f"INSERT INTO user_companions(user_id,design_id,quantity,acquired_at) VALUES({fourth['user']},'david-lamb:base',1,now())")
sql(f"UPDATE companion_instances SET growth_xp=1000,total_earned_xp=1000,"
    f"care_days=10,health=90,satiety=90,cleanliness=90 WHERE user_id={fourth['user']}")

# Match MissionWindow: the most recently closed month, including its final week.
today = dt.datetime.now(ZoneInfo('Asia/Seoul')).date()
last = today.replace(day=1) - dt.timedelta(days=1)
def close(day):
    return day - dt.timedelta(days=day.weekday()) + dt.timedelta(days=7)
if today < close(last):
    last = last.replace(day=1) - dt.timedelta(days=1)
day = last.replace(day=1)
day += dt.timedelta(days=(-day.weekday()) % 7)
second = fixtures[1]
sql(f"INSERT INTO garden_expeditions(user_id,id,design_id,started_on,ready_at) VALUES({second['user']},'45d5f71f-5d02-4d99-98b1-4e9f420db1b5','david-lamb:base',(now() AT TIME ZONE 'Asia/Seoul')::date,now()-interval '1 minute')")
season_month = 12 if today.month in (1, 2, 12) else 3 if today.month <= 5 else 6 if today.month <= 8 else 9
season_start = dt.date(today.year - int(today.month <= 2), season_month, 1)
sql(f"INSERT INTO garden_season_progress(user_id, season_start, completed) VALUES({second['user']},'{season_start}',2)")

while day <= last:
    end = day + dt.timedelta(days=6)
    sql(f"INSERT INTO weekly_devotion_records(campus_id,user_id,week_start_date,week_end_date,quiet_time_count,prayer_count,bible_reading_count,saturday_late_minutes,submitted_at,created_at,updated_at) VALUES({second['campus']},{second['user']},'{day}','{end}',5,5,5,0,now()-interval '1 minute',now(),now())")
    day += dt.timedelta(days=7)
with open(os.environ['GITHUB_ENV'], 'a') as output:
    output.write('FAITHLOG_QA_FIXTURES=' + json.dumps(fixtures, separators=(',', ':')) + '\n')
print('Seeded four isolated QA accounts')
