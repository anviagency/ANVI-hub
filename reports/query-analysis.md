# ANVI Query Analysis (Mission 3.5 P3)

_EXPLAIN (ANALYZE, BUFFERS) of the Stage-1 candidate-filter query at each scale._

```sql
SELECT c.id
    FROM candidate c
   WHERE c.availability <> 'placed'
     AND EXISTS (
       SELECT 1 FROM candidate_skill cs JOIN skill s ON s.id = cs.skill_id
        WHERE cs.candidate_id = c.id AND s.canonical_name IN ('React','Node.js','PostgreSQL')
     )
   ORDER BY c.updated_at DESC
   LIMIT 320
```

## 100,000 candidates — exec 1.7ms, planning 0.42ms

```
Limit  (cost=0.85..1719.73 rows=320 width=18) (actual time=0.047..0.917 rows=320 loops=1)
  Buffers: shared hit=3513
  ->  Nested Loop Semi Join  (cost=0.85..124619.49 rows=23200 width=18) (actual time=0.047..0.905 rows=320 loops=1)
        Buffers: shared hit=3513
        ->  Index Scan Backward using candidate_updated_at_idx on candidate c  (cost=0.29..9254.51 rows=90213 width=18) (actual time=0.040..0.102 rows=403 loops=1)
              Filter: (availability <> 'placed'::"Availability")
              Rows Removed by Filter: 250
              Buffers: shared hit=657
        ->  Nested Loop  (cost=0.56..1.27 rows=1 width=10) (actual time=0.002..0.002 rows=1 loops=403)
              Buffers: shared hit=2856
              ->  Index Only Scan using candidate_skill_candidate_id_skill_id_key on candidate_skill cs  (cost=0.42..0.77 rows=3 width=36) (actual time=0.001..0.001 rows=2 loops=403)
                    Index Cond: (candidate_id = c.id)
                    Heap Fetches: 621
                    Buffers: shared hit=1614
              ->  Index Scan using skill_pkey on skill s  (cost=0.14..0.16 rows=1 width=26) (actual time=0.000..0.000 rows=1 loops=621)
                    Index Cond: (id = cs.skill_id)
                    Filter: (canonical_name = ANY ('{React,Node.js,PostgreSQL}'::text[]))
                    Rows Removed by Filter: 0
                    Buffers: shared hit=1242
Planning:
  Buffers: shared hit=33
Planning Time: 0.121 ms
Execution Time: 0.939 ms
```

## 250,000 candidates — exec 4.3ms, planning 0.41ms

```
Limit  (cost=0.86..1845.59 rows=320 width=19) (actual time=0.155..1.403 rows=320 loops=1)
  Buffers: shared hit=4619
  ->  Nested Loop Semi Join  (cost=0.86..333592.27 rows=57867 width=19) (actual time=0.155..1.391 rows=320 loops=1)
        Buffers: shared hit=4619
        ->  Index Scan Backward using candidate_updated_at_idx on candidate c  (cost=0.29..30909.32 rows=225029 width=19) (actual time=0.146..0.229 rows=479 loops=1)
              Filter: (availability <> 'placed'::"Availability")
              Rows Removed by Filter: 625
              Buffers: shared hit=1108
        ->  Nested Loop  (cost=0.56..1.34 rows=1 width=11) (actual time=0.002..0.002 rows=1 loops=479)
              Buffers: shared hit=3511
              ->  Index Only Scan using candidate_skill_candidate_id_skill_id_key on candidate_skill cs  (cost=0.42..0.84 rows=3 width=37) (actual time=0.001..0.001 rows=2 loops=479)
                    Index Cond: (candidate_id = c.id)
                    Heap Fetches: 797
                    Buffers: shared hit=1917
              ->  Index Scan using skill_pkey on skill s  (cost=0.14..0.16 rows=1 width=26) (actual time=0.000..0.000 rows=0 loops=797)
                    Index Cond: (id = cs.skill_id)
                    Filter: (canonical_name = ANY ('{React,Node.js,PostgreSQL}'::text[]))
                    Rows Removed by Filter: 1
                    Buffers: shared hit=1594
Planning:
  Buffers: shared hit=20
Planning Time: 0.158 ms
Execution Time: 1.424 ms
```

## 500,000 candidates — exec 5.3ms, planning 0.35ms

```
Limit  (cost=0.99..1941.07 rows=320 width=19) (actual time=0.558..1.831 rows=320 loops=1)
  Buffers: shared hit=5235
  ->  Nested Loop Semi Join  (cost=0.99..701714.51 rows=115742 width=19) (actual time=0.558..1.819 rows=320 loops=1)
        Buffers: shared hit=5235
        ->  Index Scan Backward using candidate_updated_at_idx on candidate c  (cost=0.42..73506.66 rows=450096 width=19) (actual time=0.548..0.639 rows=478 loops=1)
              Filter: (availability <> 'placed'::"Availability")
              Rows Removed by Filter: 1250
              Buffers: shared hit=1734
        ->  Nested Loop  (cost=0.57..1.39 rows=1 width=11) (actual time=0.002..0.002 rows=1 loops=478)
              Buffers: shared hit=3501
              ->  Index Only Scan using candidate_skill_candidate_id_skill_id_key on candidate_skill cs  (cost=0.43..0.89 rows=3 width=37) (actual time=0.001..0.001 rows=2 loops=478)
                    Index Cond: (candidate_id = c.id)
                    Heap Fetches: 794
                    Buffers: shared hit=1913
              ->  Index Scan using skill_pkey on skill s  (cost=0.14..0.16 rows=1 width=26) (actual time=0.000..0.000 rows=0 loops=794)
                    Index Cond: (id = cs.skill_id)
                    Filter: (canonical_name = ANY ('{React,Node.js,PostgreSQL}'::text[]))
                    Rows Removed by Filter: 1
                    Buffers: shared hit=1588
Planning:
  Buffers: shared hit=20
Planning Time: 0.152 ms
Execution Time: 1.854 ms
```

