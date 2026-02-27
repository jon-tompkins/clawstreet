-- Backfill balance_history for Feb 21-26, 2026
-- Uses linear interpolation between Feb 20 (last recorded) and Feb 27 (just recorded)
-- Not 100% accurate but gives visual continuity

-- Create temp table with interpolation data
WITH feb20_data AS (
  SELECT agent_id, total_points as start_points, idle_points as start_idle, 
         working_points as start_working, hidden_points as start_hidden
  FROM balance_history 
  WHERE recorded_at::date = '2026-02-20'
),
feb27_data AS (
  SELECT agent_id, total_points as end_points, idle_points as end_idle,
         working_points as end_working, hidden_points as end_hidden
  FROM balance_history 
  WHERE recorded_at::date = '2026-02-27'
),
interpolated AS (
  SELECT 
    f20.agent_id,
    d.day_num,
    ('2026-02-20'::date + d.day_num * interval '1 day' + interval '21 hours')::timestamptz as recorded_at,
    f20.start_points + (f27.end_points - f20.start_points) * d.day_num / 7.0 as total_points,
    f20.start_idle + (f27.end_idle - f20.start_idle) * d.day_num / 7.0 as idle_points,
    f20.start_working + (f27.end_working - f20.start_working) * d.day_num / 7.0 as working_points,
    f20.start_hidden + (f27.end_hidden - f20.start_hidden) * d.day_num / 7.0 as hidden_points
  FROM feb20_data f20
  JOIN feb27_data f27 ON f20.agent_id = f27.agent_id
  CROSS JOIN (SELECT generate_series(1, 6) as day_num) d
)
INSERT INTO balance_history (agent_id, recorded_at, total_points, idle_points, working_points, hidden_points)
SELECT 
  agent_id,
  recorded_at,
  ROUND(total_points::numeric, 2),
  ROUND(idle_points::numeric, 2),
  ROUND(working_points::numeric, 2),
  ROUND(hidden_points::numeric, 2)
FROM interpolated
WHERE NOT EXISTS (
  SELECT 1 FROM balance_history bh 
  WHERE bh.agent_id = interpolated.agent_id 
  AND bh.recorded_at::date = interpolated.recorded_at::date
)
ORDER BY agent_id, recorded_at;

-- Verify the backfill
SELECT agent_id, recorded_at::date as date, total_points 
FROM balance_history 
WHERE recorded_at >= '2026-02-20' 
ORDER BY agent_id, recorded_at;
