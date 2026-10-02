#!/bin/bash
# Golden-path API test for the Skills Checklist feature
B=http://localhost:3000
J() { python3 -c "import sys,json;d=json.load(sys.stdin);print(json.dumps(d)[:400])"; }

echo "── bootstrap (seed) ──"
curl -s $B/api/bootstrap | head -c 120; echo

echo "── 1. login demo account ──"
curl -s -c /tmp/ck.txt -X POST $B/api/checklist/account -H 'Content-Type: application/json' \
  -d '{"action":"login","email":"emma.chen@example.com","password":"demo1234"}' | head -c 200; echo

echo "── 2. me (dashboard payload) ──"
ME=$(curl -s -b /tmp/ck.txt -X POST $B/api/checklist/account -H 'Content-Type: application/json' -d '{"action":"me"}')
echo "$ME" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('account:', d['account'])
print('completions:', [(c['specialtyLabel'], c['source'], len(c['shareLinks'])) for c in d['completions']])
print('requests:', [(r['specialty'], r['status']) for r in d['requests']])
print('invites:', len(d['invites']))
import re
open('/tmp/reqid','w').write([r['id'] for r in d['requests'] if r['status']=='PENDING'][0])
open('/tmp/compid','w').write(d['completions'][0]['id'])
"
REQID=$(cat /tmp/reqid); COMPID=$(cat /tmp/compid)
echo "pending request: $REQID · completion: $COMPID"

echo "── 3. superadmin auth + pending requests ──"
curl -s -X POST $B/api/superadmin -H 'Content-Type: application/json' \
  -d '{"action":"auth","code":"zipvault2026"}' | python3 -c "import sys,json;d=json.load(sys.stdin);print('stats:',d['stats'])"
curl -s -X POST $B/api/superadmin -H 'Content-Type: application/json' \
  -d '{"action":"requests","code":"zipvault2026"}' | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('queue:', [(r['id'][:12], r['specialty'], r['status']) for r in d['requests']])
open('/tmp/reqid2','w').write([r['id'] for r in d['requests'] if r['status']=='PENDING'][0])
"
REQID2=$(cat /tmp/reqid2)

echo "── 4. superadmin approves ──"
curl -s -X POST $B/api/superadmin -H 'Content-Type: application/json' \
  -d "{\"action\":\"decide\",\"code\":\"zipvault2026\",\"id\":\"$REQID2\",\"approve\":true}" | head -c 200; echo

echo "── 5. catalog + complete the GENERAL checklist ──"
curl -s $B/api/checklists | python3 -c "
import sys,json
d=json.load(sys.stdin)
s=[c for c in d['checklists'] if c['specialty']=='GENERAL'][0]
print('set:', s['label'], s['jobTitle'], len(s['skills']), 'skills')
import json as j
open('/tmp/answers','w').write(j.dumps([
  {'category':sk['category'],'skill':sk['name'],'questionType':sk['questionType'],
   'value': None if (sk['hasNA'] and i%4==3) else (4 if i%2==0 else 3), 'na': bool(sk['hasNA'] and i%4==3)}
  for i,sk in enumerate(s['skills'])]))
"
ANSWERS=$(cat /tmp/answers)
curl -s -b /tmp/ck.txt -X POST $B/api/checklist/complete -H 'Content-Type: application/json' \
  -d "{\"requestId\":\"$REQID2\",\"profession\":\"Nursing\",\"jobTitle\":\"RN\",\"specialty\":\"GENERAL\",\"yearsExperience\":4,\"answers\":$ANSWERS}" | head -c 220; echo

echo "── 6. share: create one-time + 7-day links ──"
curl -s -b /tmp/ck.txt -X POST $B/api/checklist/share -H 'Content-Type: application/json' \
  -d "{\"completionId\":\"$COMPID\",\"accessType\":\"ONE_TIME\",\"label\":\"One-time demo\"}" | python3 -c "
import sys,json;d=json.load(sys.stdin);print('one-time link:', d['link']['token'][:16]+'…');open('/tmp/tok1','w').write(d['link']['token'])"
curl -s -b /tmp/ck.txt -X POST $B/api/checklist/share -H 'Content-Type: application/json' \
  -d "{\"completionId\":\"$COMPID\",\"accessType\":\"DURATION\",\"durationDays\":7}" | python3 -c "
import sys,json;d=json.load(sys.stdin);print('7-day link:', d['link']['token'][:16]+'…');open('/tmp/tok7','w').write(d['link']['token'])"
TOK1=$(cat /tmp/tok1); TOK7=$(cat /tmp/tok7)

echo "── 7. resolve 7-day link (should be ok) ──"
curl -s -X POST $B/api/checklist/share -H 'Content-Type: application/json' \
  -d "{\"action\":\"resolve\",\"token\":\"$TOK7\"}" | python3 -c "
import sys,json;d=json.load(sys.stdin);print('ok:',d['ok'],'· access:',d['link']['accessType'],d['link']['durationDays'],'days · candidate:',d['completion']['candidateName'])"

echo "── 8. resolve one-time twice (2nd must fail as 'used') ──"
curl -s -X POST $B/api/checklist/share -H 'Content-Type: application/json' -d "{\"action\":\"resolve\",\"token\":\"$TOK1\"}" | head -c 60; echo
curl -s -X POST $B/api/checklist/share -H 'Content-Type: application/json' -d "{\"action\":\"resolve\",\"token\":\"$TOK1\"}" | head -c 60; echo

echo "── 9. recruiter invite flow ──"
curl -s -X POST $B/api/checklist/invite -H 'Content-Type: application/json' \
  -d "{\"code\":\"meds2026\",\"action\":\"send\",\"candidateName\":\"Emma Chen\",\"candidateEmail\":\"emma.chen@example.com\",\"recruiterName\":\"Recruiter · VaultVerify\",\"facilityName\":\"St. Mary Medical Center\",\"message\":\"Needed before the 14th\"}" | head -c 160; echo
curl -s -X POST $B/api/checklist/invite -H 'Content-Type: application/json' \
  -d "{\"code\":\"meds2026\",\"action\":\"list\"}" | python3 -c "
import sys,json;d=json.load(sys.stdin)
print('invites:', [(i['candidateName'], i['status'], bool(i['completion'])) for i in d['invites']][:5])"

echo "── 10. PDFs (share + candidate + invite) ──"
curl -s -o /tmp/share.pdf -w "share pdf: %{http_code} " "$B/api/checklist/pdf?share=$TOK7"
python3 -c "print('pages:', len(__import__('pypdf').PdfReader('/tmp/share.pdf').pages))" 2>/dev/null || echo "(pypdf n/a)"
curl -s -b /tmp/ck.txt -o /tmp/own.pdf -w "own pdf: %{http_code}\n" "$B/api/checklist/pdf?completion=$COMPID"
echo "── done ──"
