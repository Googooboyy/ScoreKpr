-- Migration 039: Guest meeples (is_guest), RPC updates for join info and tier fetch

ALTER TABLE players
    ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT false;

-- Include is_guest in tier RPC (OUT row shape changed — must drop, not CREATE OR REPLACE)
DROP FUNCTION IF EXISTS get_playgroup_players_with_tiers(UUID);

CREATE FUNCTION get_playgroup_players_with_tiers(p_playgroup_id UUID)
RETURNS TABLE(
    id UUID,
    name TEXT,
    user_id UUID,
    tier INT,
    is_guest BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        p.id,
        p.name,
        p.user_id,
        COALESCE(ut.tier, 1)::INT,
        COALESCE(p.is_guest, false)
    FROM players p
    LEFT JOIN user_tiers ut ON p.user_id = ut.user_id
    WHERE p.playgroup_id = p_playgroup_id
    AND (auth.uid() IS NULL OR is_playgroup_member(p_playgroup_id, auth.uid()));
$$;

GRANT EXECUTE ON FUNCTION get_playgroup_players_with_tiers(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_playgroup_players_with_tiers(UUID) TO anon;

-- Join info: travellers = unlinked non-guests; add guest_meeples_count
DROP FUNCTION IF EXISTS get_campaign_join_info(UUID);

CREATE FUNCTION get_campaign_join_info(p_playgroup_id UUID)
RETURNS TABLE(
    linked_count INT,
    allowed_tiers INTEGER[],
    owner_id UUID,
    travellers INT,
    tier_1_count INT,
    tier_2_count INT,
    tier_3_count INT,
    guest_meeples_count INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        (SELECT COUNT(*)::INT FROM players WHERE playgroup_id = p.id AND user_id IS NOT NULL),
        COALESCE(p.join_allowed_tiers, ARRAY[1,2,3]),
        p.created_by,
        (SELECT COUNT(*)::INT FROM players pl
         WHERE pl.playgroup_id = p.id AND pl.user_id IS NULL AND COALESCE(pl.is_guest, false) = false),
        (SELECT COUNT(*)::INT FROM players pl
         WHERE pl.playgroup_id = p.id AND pl.user_id IS NOT NULL
         AND COALESCE((SELECT tier FROM user_tiers WHERE user_id = pl.user_id LIMIT 1), 1) = 1),
        (SELECT COUNT(*)::INT FROM players pl
         JOIN user_tiers ut ON pl.user_id = ut.user_id AND ut.tier = 2
         WHERE pl.playgroup_id = p.id),
        (SELECT COUNT(*)::INT FROM players pl
         JOIN user_tiers ut ON pl.user_id = ut.user_id AND ut.tier = 3
         WHERE pl.playgroup_id = p.id),
        (SELECT COUNT(*)::INT FROM players pl
         WHERE pl.playgroup_id = p.id AND COALESCE(pl.is_guest, false) = true)
    FROM playgroups p
    WHERE p.id = p_playgroup_id;
$$;

GRANT EXECUTE ON FUNCTION get_campaign_join_info(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_campaign_join_info(UUID) TO anon;
