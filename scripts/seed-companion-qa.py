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
for index in range(2):
    email = f'companion-qa-{index}@example.test'
    user = int(sql(f"INSERT INTO users(name,email,password_hash,role,is_active,token_version,created_at,updated_at) VALUES('QA','{email}',crypt('test-only-password',gen_salt('bf',10)),'USER',true,0,now(),now()) RETURNING id"))
    campus = int(sql(f"INSERT INTO campuses(name,invite_code,is_active,created_at,updated_at) VALUES('QA','companion-qa-{index}',true,now(),now()) RETURNING id"))
    sql(f"INSERT INTO campus_members(campus_id,user_id,campus_role,status,joined_at,created_at,updated_at) VALUES({campus},{user},'MEMBER','ACTIVE','2025-01-01',now(),now())")
    fixtures.append(dict(user=user, campus=campus, email=email))
first = fixtures[0]
sql(f"INSERT INTO point_wallets(user_id,balance,version) VALUES({first['user']},1000,0)")
sql(f"INSERT INTO point_transactions(user_id,delta,balance_after,business_key,created_at) VALUES({first['user']},1000,1000,'qa-initial',now())")
sql(f"INSERT INTO user_companions(user_id,design_id,quantity,acquired_at) VALUES({first['user']},'david-lamb:base',3,now())")
sql(f"INSERT INTO user_backgrounds(user_id,background_id,acquired_at) VALUES({first['user']},'meadow',now())")
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
while day <= last:
    end = day + dt.timedelta(days=6)
    sql(f"INSERT INTO weekly_devotion_records(campus_id,user_id,week_start_date,week_end_date,quiet_time_count,prayer_count,bible_reading_count,saturday_late_minutes,submitted_at,created_at,updated_at) VALUES({second['campus']},{second['user']},'{day}','{end}',5,5,5,0,now()-interval '1 minute',now(),now())")
    day += dt.timedelta(days=7)
with open(os.environ['GITHUB_ENV'], 'a') as output:
    output.write('FAITHLOG_QA_FIXTURES=' + json.dumps(fixtures, separators=(',', ':')) + '\n')
print('Seeded two isolated QA accounts')
