import json,io,sys,os
BASE=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src=io.open(os.path.join(BASE,'sunzi.js'),encoding='utf-8').read()
d=json.loads(src[src.index('window.SUNZI =')+len('window.SUNZI ='):].rstrip()[:-1])
a=int(sys.argv[1]); b=int(sys.argv[2])
for s in d:
    if a<=s['no']<=b:
        print('【%d %s／%s】'%(s['no'],s['chapterName'],s['name']))
        for blk in s['text']:
            for l in blk['lines']: print('  '+l)
        print()
