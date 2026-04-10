import {
    data,
    currentEntry,
    showAllGames,
    showAllHistory,
    showAllGamesInAdd,
    uiState,
    toggleShowAllGames,
    toggleShowAllHistory,
    toggleShowAllGamesInAdd,
    escapeHtml,
    formatDate,
    saveData,
    playerIsGuest
} from './data.js';
import { deletePlayer, deleteGame, deleteEntryById } from './actions.js';
import { openPlayerImageModal, openGameImageModal, openEditEntryModal, openPlayerProfileModal, openImageLightbox, openScoreSnapshotModal } from './modals.js';
import { getActivePlaygroup } from './playgroups.js';
import { fetchGamesFromOtherCampaigns, insertGame, upsertGameMetadata } from './supabase.js';

const DEFAULT_LEADERBOARD_QUOTES = [
    'Roll with it.',
    'Winning is just the beginning.',
    'May the dice be ever in your favor.',
    'One more game? Always.',
    'Board games > boring games.'
];

function getLeaderboardQuotes() {
    const q = typeof window !== 'undefined' && window._scorekeeperLeaderboardQuotes;
    return (Array.isArray(q) && q.length > 0) ? q : DEFAULT_LEADERBOARD_QUOTES;
}

function pickRandomQuote() {
    const quotes = getLeaderboardQuotes();
    return quotes[Math.floor(Math.random() * quotes.length)];
}

/** Update quotes on all player cards in a wave, one card at a time. */
export function rollQuotesWave() {
    const container = document.getElementById('playersContainer');
    if (!container) return;
    const cards = container.querySelectorAll('.player-card');
    const staggerMs = 120;
    cards.forEach((card, index) => {
        const quoteEl = card.querySelector('.player-card-quote');
        if (!quoteEl) return;
        const player = card.getAttribute('data-player');
        const pd = player && data.playerData && data.playerData[player] ? data.playerData[player] : {};
        const isMyAccount = !!(data.currentUserId && pd.userId && pd.userId === data.currentUserId);
        if (isMyAccount && data.currentUserFavouriteQuote) return;
        setTimeout(() => {
            quoteEl.textContent = pickRandomQuote();
            quoteEl.classList.add('quote-just-updated');
            setTimeout(() => quoteEl.classList.remove('quote-just-updated'), 320);
        }, index * staggerMs);
    });
}

export function renderAll() {
    renderPlayers();
    renderGames();
    renderGameSelection();
    renderPlayerSelection();
    renderHistory();
}

function calculateGameBreakdown(player) {
    const playerEntries = data.entries.filter(e => e.player === player);
    const gameCounts = {};
    playerEntries.forEach(entry => {
        gameCounts[entry.game] = (gameCounts[entry.game] || 0) + 1;
    });
    const sorted = Object.entries(gameCounts)
        .map(([game, count]) => ({ game: game, count: count }))
        .sort((a, b) => b.count - a.count);
    const maxCount = sorted.length > 0 ? sorted[0].count : 0;
    return sorted.map(g => ({ game: g.game, count: g.count, isTop: g.count === maxCount && g.count > 0 }));
}

function renderGameBreakdown(breakdown) {
    if (breakdown.length === 0) {
        return '<span class="no-games-msg">No victories yet... time to play! 🎲</span>';
    }
    return breakdown.map(g => {
        const topClass = g.isTop ? 'top-game' : '';
        return '<div class="player-game-tag ' + topClass + '" title="' + escapeHtml(g.game) + ': ' + g.count + ' win' + (g.count !== 1 ? 's' : '') + '">' +
            '<span class="player-game-name">' + escapeHtml(g.game) + '</span>' +
            '<span class="player-game-count">' + g.count + '</span>' +
            '</div>';
    }).join('');
}

export function toggleVictoryRoster(player) {
    const roster = document.getElementById('roster-' + player);
    const toggle = document.getElementById('toggle-' + player);
    const header = toggle?.closest('.victory-roster-header');
    const label = header?.querySelector('.victory-roster-label');

    if (roster && roster.classList.contains('expanded')) {
        roster.classList.remove('expanded');
        if (toggle) toggle.classList.remove('expanded');
        if (label) label.textContent = 'more';
    } else if (roster && toggle) {
        roster.classList.add('expanded');
        toggle.classList.add('expanded');
        if (label) label.textContent = 'less';
    }
}

function participatedInEntry(e, p) {
    return (e.participants && e.participants.includes(p)) || (!e.participants && e.player === p);
}

function buildPlayerLeaderboardStat(player) {
    const playerEntries = data.entries.filter(e => e.player === player);
    const wins = playerEntries.length;
    const participatedEntries = data.entries.filter(e => participatedInEntry(e, player));
    const gamesPlayed = participatedEntries.length;
    const winPct = gamesPlayed > 0 ? (wins / gamesPlayed) * 100 : 0;
    const gameBreakdown = calculateGameBreakdown(player);
    const lastPlayedDate = participatedEntries.reduce((latest, entry) => {
        if (!entry.date) return latest;
        if (!latest) return entry.date;
        return new Date(entry.date) > new Date(latest) ? entry.date : latest;
    }, null);
    const playerData = data.playerData && data.playerData[player] ? data.playerData[player] : {};
    return {
        player,
        wins,
        gamesPlayed,
        winPct,
        gameBreakdown,
        lastPlayedDate,
        image: playerData.image,
        color: playerData.color,
        userId: playerData.userId || null
    };
}

function sortPlayerStatsByWins(a, b) {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return (b.winPct || 0) - (a.winPct || 0);
}

function renderSingleLeaderboardCard(stat, showCrown, isGuestCard) {
    const currentUserId = data.currentUserId;
    const playerDataObj = data.playerData && data.playerData[stat.player] ? data.playerData[stat.player] : {};
    const isMyAccount = !!(currentUserId && playerDataObj.userId && playerDataObj.userId === currentUserId);
    const linkedClass = isMyAccount ? ' is-my-account' : '';
    const hasPlayerColorClass = stat.color ? ' has-player-color' : '';
    const guestClass = isGuestCard ? ' player-card-is-guest' : '';
    const playerCardStyle = stat.color ? '--player-card-color: ' + stat.color + ';' : '';
    const crownHtml = showCrown ? '<div class="player-crown">👑</div>' : '';
    const youBadge = isMyAccount ? '<span class="player-you-badge" title="Your linked account">You</span>' : '';
    const isTraveller = !stat.userId;
    const travellerBadge = isTraveller
        ? '<span class="meeple-traveller-badge" title="Unlinked meeple">Traveller</span>'
        : '';
    const tierLabel = stat.userId && playerDataObj.tier
        ? (playerDataObj.tier === 2 ? 'Noble' : playerDataObj.tier === 3 ? 'Royal' : 'Commoner')
        : '';
    const tierPill = tierLabel
        ? '<span class="player-tier-pill player-tier-' + tierLabel.toLowerCase() + '" title="Membership tier">' + escapeHtml(tierLabel) + '</span>'
        : '';
    const guestBadge = isGuestCard ? '<span class="meeple-guest-badge">Guest</span>' : '';
    const imageHtml = stat.image
        ? '<div class="player-card-image-container">' + crownHtml + '<img src="' + escapeHtml(stat.image) + '" alt="' + escapeHtml(stat.player) + '" class="player-card-image" onerror="this.style.display=\'none\'; this.parentElement.querySelector(\'.player-card-image-placeholder\').style.display=\'flex\';"><div class="player-card-image-placeholder" style="display: none;">👤</div></div>'
        : '<div class="player-card-image-container">' + crownHtml + '<div class="player-card-image-placeholder">👤</div></div>';
    const displayQuote = (currentUserId && stat.userId === currentUserId && data.currentUserFavouriteQuote)
        ? data.currentUserFavouriteQuote
        : pickRandomQuote();

    return '<div class="player-card' + hasPlayerColorClass + linkedClass + guestClass + '" data-player="' + escapeHtml(stat.player) + '" style="' + playerCardStyle + '">' +
        '<div class="player-header">' +
        '<div class="player-info-section player-profile-trigger" data-player="' + escapeHtml(stat.player) + '" title="View profile" style="cursor:pointer;">' + imageHtml +
        '<div class="player-name-section">' +
        '<div class="player-name">' + escapeHtml(stat.player) + youBadge + travellerBadge + tierPill + guestBadge + '</div>' +
        '<div class="player-card-quote">' + escapeHtml(displayQuote) + '</div>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '<div class="victory-roster-header" onclick="window.toggleVictoryRoster(\'' + escapeHtml(stat.player).replace(/'/g, "\\'") + '\')">' +
        '<div class="victory-roster-wins">' + stat.wins + ' Games Won' + (stat.gamesPlayed > 0 ? ' · ' + (stat.winPct || 0).toFixed(0) + '% win rate' : '') + '</div>' +
        '<div class="victory-roster-toggle-group">' +
        '<span class="victory-roster-label">more</span>' +
        '<span class="victory-roster-toggle" id="toggle-' + escapeHtml(stat.player) + '">▼</span>' +
        '</div>' +
        '</div>' +
        '<div class="player-game-stats" id="roster-' + escapeHtml(stat.player) + '">' +
        '<div class="player-games-list">' + renderGameBreakdown(stat.gameBreakdown) + '</div>' +
        '</div>' +
        '</div>';
}

export function renderPlayers() {
    const container = document.getElementById('playersContainer');
    if (!container) return;
    const toggleBtn = document.getElementById('playersToggleBtn');

    if (data.players.length === 0) {
        if (!data.currentUserId) {
            container.innerHTML = '';
        } else {
            container.innerHTML = '' +
                '<div class="empty-state" style="grid-column: 1/-1;">' +
                '<div class="empty-state-icon">👥</div>' +
                '<p style="margin-bottom: 10px;">No meeples yet for this campaign.</p>' +
                '<button class="about-cta-btn about-cta-btn--ghost about-cta-btn--small" id="emptyAddWinBtn">+ Add a game win</button>' +
                '</div>';
            const addWinBtn = document.getElementById('emptyAddWinBtn');
            if (addWinBtn) {
                addWinBtn.addEventListener('click', () => {
                    document.dispatchEvent(new Event('scorekeeper:openAddGame'));
                });
            }
        }
        if (toggleBtn) toggleBtn.style.display = 'none';
        return;
    }

    const allSorted = data.players.map(buildPlayerLeaderboardStat).sort(sortPlayerStatsByWins);
    const crownPlayerName = allSorted[0] ? allSorted[0].player : null;

    const coreNames = data.players.filter(p => !playerIsGuest(p)).sort((a, b) => a.localeCompare(b));
    const guestNames = data.players.filter(p => playerIsGuest(p)).sort((a, b) => a.localeCompare(b));
    const coreStats = coreNames.map(buildPlayerLeaderboardStat).sort(sortPlayerStatsByWins);
    const guestStats = guestNames.map(buildPlayerLeaderboardStat).sort(sortPlayerStatsByWins);

    if (toggleBtn) toggleBtn.style.display = 'none';

    const spanRow = '<div class="meeple-section-label" style="grid-column: 1 / -1;">';
    const parts = [];
    if (guestStats.length > 0 && coreStats.length > 0) {
        parts.push(spanRow + 'Campaign meeples</div>');
    }
    parts.push(coreStats.map(stat => renderSingleLeaderboardCard(stat, stat.player === crownPlayerName, false)).join(''));
    if (guestStats.length > 0) {
        parts.push(spanRow + 'Guest meeples</div>');
        parts.push(guestStats.map(stat => renderSingleLeaderboardCard(stat, stat.player === crownPlayerName, true)).join(''));
    }

    container.innerHTML = parts.join('');

    container.querySelectorAll('.player-profile-trigger').forEach(el => {
        el.addEventListener('click', function (e) {
            e.stopPropagation();
            openPlayerProfileModal(this.getAttribute('data-player'));
        });
    });

    // Player avatar image lightbox from leaderboard card (clicking image only)
    container.querySelectorAll('.player-card-image').forEach(imgEl => {
        imgEl.addEventListener('click', function (e) {
            e.stopPropagation();
            const card = this.closest('.player-card');
            if (!card) return;
            const playerName = card.getAttribute('data-player') || '';
            const imageUrl = this.getAttribute('src');
            if (!imageUrl) return;
            const pg = getActivePlaygroup();
            const canCustomize = !!pg;
            openImageLightbox(imageUrl, playerName, canCustomize, () => openPlayerImageModal(playerName));
        });
    });

    // Tier pills and Traveller badge open tier info modal
    container.querySelectorAll('.player-tier-pill').forEach(pill => {
        pill.addEventListener('click', function (e) {
            e.stopPropagation();
            const label = (this.textContent || '').trim();
            let t = 1;
            if (label === 'Noble') t = 2;
            else if (label === 'Royal') t = 3;
            import('./modals.js').then(m => m.openTierInfoModal(t)).catch(() => {});
        });
    });
    container.querySelectorAll('.meeple-traveller-badge').forEach(badge => {
        badge.addEventListener('click', function (e) {
            e.stopPropagation();
            import('./modals.js').then(m => m.openTierInfoModal('traveller')).catch(() => {});
        });
    });

}

export function renderGames() {
    const container = document.getElementById('gamesContainer');
    const toggleBtn = document.getElementById('gamesToggleBtn');
    const toggleText = document.getElementById('gamesToggleText');
    const toggleIcon = document.getElementById('gamesToggleIcon');

    if (data.games.length === 0) {
        if (!data.currentUserId) {
            container.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;"><div class="empty-state-icon">🎲</div><h3>No Games Yet</h3><p>Add games in the "Add a Game Win" section</p></div>';
        } else {
            container.innerHTML = '' +
                '<div class="empty-state" style="grid-column: 1/-1;">' +
                '<div class="empty-state-icon">🎲</div>' +
                '<p style="margin-bottom: 10px;">No games yet for this campaign.</p>' +
                '<button class="about-cta-btn about-cta-btn--ghost about-cta-btn--small" id="emptyAddGameBtn">+ Add a game win</button>' +
                '</div>';
            const addGameBtn = document.getElementById('emptyAddGameBtn');
            if (addGameBtn) {
                addGameBtn.addEventListener('click', () => {
                    document.dispatchEvent(new Event('scorekeeper:openAddGame'));
                });
            }
        }
        toggleBtn.style.display = 'none';
        return;
    }

    let gameStats = data.games.map(game => {
        const wins = data.entries.filter(e => e.game === game).length;
        const lastPlayed = data.entries
            .filter(e => e.game === game)
            .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        const gameData = data.gameData && data.gameData[game] ? data.gameData[game] : {};
        const gameHistory = data.entries
            .filter(e => e.game === game)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        return { game: game, wins: wins, lastPlayed: lastPlayed ? lastPlayed.date : null, image: gameData.image, history: gameHistory };
    }).sort((a, b) => b.wins - a.wins);

    const totalGames = gameStats.length;
    const hasMoreGames = totalGames > 4;
    toggleBtn.style.display = hasMoreGames ? 'flex' : 'none';

    if (showAllGames) {
        toggleText.textContent = 'Less';
        toggleIcon.classList.add('expanded');
    } else {
        toggleText.textContent = 'More';
        toggleIcon.classList.remove('expanded');
    }

    if (!showAllGames && hasMoreGames) {
        gameStats = gameStats.slice(0, 4);
    }

    container.innerHTML = gameStats.map((stat) => {
        const imageHtml = stat.image ?
            '<img src="' + escapeHtml(stat.image) + '" alt="' + escapeHtml(stat.game) + '" class="game-card-image" onerror="this.style.display=\'none\'; this.nextElementSibling.style.display=\'flex\';"><div class="game-card-image-placeholder" style="display: none;">🎲</div>' :
            '<div class="game-card-image-placeholder">🎲</div>';
        const lastPlayedText = stat.lastPlayed ? 'Last: ' + formatDate(stat.lastPlayed) : 'Never played';
        const historyHtml = stat.history.length > 0 ?
            stat.history.map(h =>
                '<div class="game-history-item">' +
                '<div class="game-history-head"><span class="game-history-winner">🏆 ' + escapeHtml(h.player) + '</span><span class="game-history-date">' + formatDate(h.date) + '</span></div>' +
                _renderSnapshotPanel(h, 'game-history-snapshot') +
                '</div>'
            ).join('') :
            '<div style="text-align: center; color: var(--text-muted); padding: 20px;">No games played yet</div>';

        return '<div class="game-card-wrapper" data-game="' + escapeHtml(stat.game) + '">' +
            '<div class="game-card">' + imageHtml +
            '<div class="game-card-info">' +
            '<h3>' + escapeHtml(stat.game) + '</h3>' +
            '<div class="game-card-meta">' + lastPlayedText + '</div>' +
            '</div>' +
            '<div class="game-card-stats">' +
            '<div class="game-card-number">' + stat.wins + '</div>' +
            '<div class="game-card-label">Wins</div>' +
            '</div>' +
            '<div class="game-card-actions">' +
            '<button class="edit-game-btn" data-game="' + escapeHtml(stat.game) + '" title="Set image">⚙️</button>' +
            '<button class="toggle-history-btn" data-game="' + escapeHtml(stat.game) + '" title="Show history">▼</button>' +
            '<button class="delete-game-btn" data-game="' + escapeHtml(stat.game) + '" title="Delete game">🗑️</button>' +
            '</div>' +
            '</div>' +
            '<div class="game-history-panel" id="history-panel-' + escapeHtml(stat.game) + '">' +
            '<div class="game-history-list">' + historyHtml + '</div>' +
            '</div>' +
            '</div>';
    }).join('');

    container.querySelectorAll('.delete-game-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            deleteGame(this.getAttribute('data-game'));
        });
    });

    container.querySelectorAll('.edit-game-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            openGameImageModal(this.getAttribute('data-game'));
        });
    });

    container.querySelectorAll('.toggle-history-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            toggleGameHistory(this.getAttribute('data-game'), this);
        });
    });
    _bindSnapshotActions(container);
}

export function toggleGameHistory(game, btn) {
    const panel = document.getElementById('history-panel-' + game);
    if (panel.classList.contains('expanded')) {
        panel.classList.remove('expanded');
        btn.classList.remove('active');
        btn.innerHTML = '▼';
        btn.title = 'Show history';
    } else {
        document.querySelectorAll('.game-history-panel').forEach(p => p.classList.remove('expanded'));
        document.querySelectorAll('.toggle-history-btn').forEach(b => {
            b.classList.remove('active');
            b.innerHTML = '▼';
            b.title = 'Show history';
        });

        panel.classList.add('expanded');
        btn.classList.add('active');
        btn.innerHTML = '▲';
        btn.title = 'Hide history';
    }
}

export function toggleGamesDisplay() {
    toggleShowAllGames();
    renderGames();
}

export function togglePlayersDisplay() {
    toggleShowAllPlayers();
    renderPlayers();
}

export function renderGameSelection() {
    const container = document.getElementById('gameSelection');
    const addBtn = container.querySelector('.add-new-btn');
    container.innerHTML = '';
    container.appendChild(addBtn);

    if (data.games.length === 0) {
        loadOtherCampaignGamesForAddWin();
        return;
    }

    // Sort games by last played (most recent first), then by name for ties
    const gameLastPlayed = {};
    data.entries.forEach(e => {
        const d = e.date ? new Date(e.date).getTime() : 0;
        if (!gameLastPlayed[e.game] || gameLastPlayed[e.game] < d) gameLastPlayed[e.game] = d;
    });
    const sortedGames = [...data.games].sort((a, b) => {
        const da = gameLastPlayed[a] || 0;
        const db = gameLastPlayed[b] || 0;
        if (db !== da) return db - da;
        return a.localeCompare(b);
    });

    const showAll = showAllGamesInAdd;
    const hasMoreThanFive = sortedGames.length > 5;
    const gamesToShow = (showAll || !hasMoreThanFive) ? sortedGames : sortedGames.slice(0, 5);

    gamesToShow.forEach(game => {
        const gameImage = data.gameData && data.gameData[game] && data.gameData[game].image;
        const div = document.createElement('div');
        div.className = 'selection-item selection-item-game' + (currentEntry.game === game ? ' selected' : '');
        div.setAttribute('data-game', game);
        div.setAttribute('title', game);
        if (gameImage) {
            const img = document.createElement('img');
            img.src = gameImage;
            img.alt = game;
            img.className = 'selection-item-game-img';
            img.onerror = function () {
                this.style.display = 'none';
                const fallback = div.querySelector('.selection-item-game-fallback');
                if (fallback) fallback.style.display = 'flex';
            };
            div.appendChild(img);
            const fallback = document.createElement('span');
            fallback.className = 'selection-item-game-fallback';
            fallback.style.display = 'none';
            fallback.textContent = game;
            div.appendChild(fallback);
        } else {
            const fallback = document.createElement('span');
            fallback.className = 'selection-item-game-fallback';
            fallback.textContent = game;
            div.appendChild(fallback);
        }
        const tooltip = document.createElement('span');
        tooltip.className = 'selection-item-game-tooltip';
        tooltip.textContent = game;
        div.appendChild(tooltip);
        div.addEventListener('click', function () {
            selectGame(this.getAttribute('data-game'));
        });
        container.appendChild(div);
    });

    if (hasMoreThanFive) {
        const showAllCard = document.createElement('div');
        showAllCard.className = 'selection-item selection-item-show-all';
        showAllCard.setAttribute('role', 'button');
        showAllCard.setAttribute('tabindex', '0');
        showAllCard.textContent = showAll ? 'Show less' : 'Show all';
        showAllCard.addEventListener('click', function () {
            toggleShowAllGamesInAdd();
            renderGameSelection();
        });
        showAllCard.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleShowAllGamesInAdd();
                renderGameSelection();
            }
        });
        container.appendChild(showAllCard);
    }

    loadOtherCampaignGamesForAddWin();
}

async function loadOtherCampaignGamesForAddWin() {
    const wrap = document.getElementById('gameSelectionOtherWrap');
    const otherGrid = document.getElementById('gameSelectionOther');
    if (!wrap || !otherGrid) return;
    const pg = getActivePlaygroup();
    if (!pg || !data.games) {
        wrap.style.display = 'none';
        return;
    }
    try {
        const otherGames = await fetchGamesFromOtherCampaigns(pg.id, data.games);
        if (!otherGames.length) {
            wrap.style.display = 'none';
            return;
        }
        wrap.style.display = showAllGamesInAdd ? '' : 'none';
        otherGrid.innerHTML = '';
        otherGames.forEach(({ name, image }) => {
            const div = document.createElement('div');
            div.className = 'selection-item selection-item-game' + (currentEntry.game === name ? ' selected' : '');
            div.setAttribute('data-game', name);
            div.setAttribute('title', name);
            if (image) {
                const img = document.createElement('img');
                img.src = image;
                img.alt = name;
                img.className = 'selection-item-game-img';
                img.onerror = function () {
                    this.style.display = 'none';
                    const fb = div.querySelector('.selection-item-game-fallback');
                    if (fb) fb.style.display = 'flex';
                };
                div.appendChild(img);
                const fallback = document.createElement('span');
                fallback.className = 'selection-item-game-fallback';
                fallback.style.display = 'none';
                fallback.textContent = name;
                div.appendChild(fallback);
            } else {
                const fallback = document.createElement('span');
                fallback.className = 'selection-item-game-fallback';
                fallback.textContent = name;
                div.appendChild(fallback);
            }
            const tooltip = document.createElement('span');
            tooltip.className = 'selection-item-game-tooltip';
            tooltip.textContent = name;
            div.appendChild(tooltip);
            div.addEventListener('click', async function () {
                const gameName = this.getAttribute('data-game');
                if (data.games.includes(gameName)) {
                    selectGame(gameName);
                    return;
                }
                try {
                    const row = await insertGame(pg.id, gameName);
                    const other = otherGames.find(g => g.name === gameName);
                    if (other?.image) {
                        await upsertGameMetadata(row.id, other.image);
                    }
                    data.games.push(gameName);
                    data._gameIdByName[gameName] = row.id;
                    if (other?.image) {
                        if (!data.gameData) data.gameData = {};
                        data.gameData[gameName] = { image: other.image };
                    }
                    saveData();
                    selectGame(gameName);
                    loadOtherCampaignGamesForAddWin();
                } catch (err) {
                    const { showNotification } = await import('./modals.js');
                    showNotification('Could not add game: ' + (err.message || err));
                }
            });
            otherGrid.appendChild(div);
        });
    } catch {
        wrap.style.display = 'none';
    }
}

function appendMeepleSelectionTile(parentEl, player) {
    const playerData = data.playerData && data.playerData[player] ? data.playerData[player] : {};
    const image = playerData.image || null;
    const inParticipants = (currentEntry.participants || []).includes(player);
    const isWinner = currentEntry.player === player;
    const selectedClass = inParticipants ? 'selected' : '';
    const winnerBadge = isWinner ? ' <span class="selection-winner-badge" title="Winner">👑</span>' : '';
    const guestBadge = playerIsGuest(player) ? ' <span class="meeple-guest-badge">Guest</span>' : '';
    const div = document.createElement('div');
    div.className = 'selection-item selection-item-meeple ' + selectedClass + (isWinner ? ' is-winner' : '');
    div.setAttribute('data-player', player);
    div.innerHTML =
        '<div class="selection-item-meeple-img-wrap">' +
        (image
            ? '<img src="' + escapeHtml(image) + '" alt="' + escapeHtml(player) + '" class="selection-item-meeple-img" onerror="this.style.display=\'none\'; this.nextElementSibling.style.display=\'flex\';"><div class="selection-item-meeple-placeholder" style="display:none;">👤</div>'
            : '<div class="selection-item-meeple-placeholder">👤</div>') +
        '</div>' +
        '<span class="selection-item-meeple-name">' + escapeHtml(player) + winnerBadge + guestBadge + '</span>';
    div.addEventListener('click', function () {
        togglePlayerInStep2(this.getAttribute('data-player'));
    });
    parentEl.appendChild(div);
}

export function renderPlayerSelection() {
    const container = document.getElementById('playerSelection');
    const guestGrid = document.getElementById('playerSelectionGuests');
    const guestLabel = document.getElementById('playerSelectionGuestLabel');
    const addBtn = container.querySelector('.add-new-btn');
    container.innerHTML = '';
    if (addBtn) container.appendChild(addBtn);
    if (guestGrid) guestGrid.innerHTML = '';

    if (data.players.length === 0) {
        const p = document.createElement('p');
        p.style.cssText = 'color: var(--text-muted); text-align: center; grid-column: 1/-1;';
        p.textContent = 'No players yet. Add your first player above.';
        container.appendChild(p);
        if (guestLabel) guestLabel.style.display = 'none';
        if (guestGrid) guestGrid.style.display = 'none';
        return;
    }

    const corePlayers = data.players.filter(p => !playerIsGuest(p)).sort((a, b) => a.localeCompare(b));
    const guestPlayers = data.players.filter(p => playerIsGuest(p)).sort((a, b) => a.localeCompare(b));

    corePlayers.forEach(player => appendMeepleSelectionTile(container, player));

    if (guestLabel && guestGrid) {
        if (guestPlayers.length > 0) {
            guestLabel.style.display = 'block';
            guestGrid.style.display = 'grid';
            guestPlayers.forEach(player => appendMeepleSelectionTile(guestGrid, player));
        } else {
            guestLabel.style.display = 'none';
            guestGrid.style.display = 'none';
        }
    }

    const continueBtn = document.getElementById('step2ContinueBtn');
    if (continueBtn) continueBtn.disabled = !currentEntry.player;
}

export function togglePlayerInStep2(player) {
    if (currentEntry.player === player) return;
    if (!currentEntry.player) {
        currentEntry.player = player;
        currentEntry.participants = [player];
    } else {
        const p = currentEntry.participants || [];
        const idx = p.indexOf(player);
        if (idx >= 0) {
            p.splice(idx, 1);
        } else {
            p.push(player);
        }
        currentEntry.participants = p;
    }
    renderPlayerSelection();
}

export function step2Continue() {
    if (!currentEntry.player) return;
    if (!currentEntry.participants || !currentEntry.participants.includes(currentEntry.player)) {
        currentEntry.participants = [currentEntry.player, ...(currentEntry.participants || []).filter(p => p !== currentEntry.player)];
    }
    nextStep(3);
}

function relativeTime(isoString) {
    if (!isoString) return '';
    const now = Date.now();
    const then = new Date(isoString).getTime();
    const diff = now - then;
    const mins = Math.floor(diff / 60000);
    if (mins < 2) return 'just now';
    if (mins < 60) return mins + ' minutes ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + ' hour' + (hrs !== 1 ? 's' : '') + ' ago';
    const days = Math.floor(hrs / 24);
    if (days < 7) return days + ' day' + (days !== 1 ? 's' : '') + ' ago';
    return formatDate(isoString);
}

function _snapshotFilePart(value, fallback = 'value') {
    const safe = String(value || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return (safe || fallback).slice(0, 18);
}

function _buildSnapshotFilenameForEntry(entry) {
    const game = _snapshotFilePart(entry.game, 'game');
    const winner = _snapshotFilePart(entry.player, 'winner');
    const date = (entry.date && /^\d{4}-\d{2}-\d{2}$/.test(entry.date))
        ? entry.date
        : new Date().toISOString().slice(0, 10);
    return `score-snapshot-${game}-${date}-${winner}.png`;
}

function _renderSnapshotPanel(entry, extraClass = '') {
    const url = entry.score_snapshot_url || null;
    const panelClass = ('history-snapshot ' + extraClass).trim();
    if (!url) {
        return '<div class="' + panelClass + '">' +
            '<div class="history-snapshot-status">not available</div>' +
            '</div>';
    }
    return '<div class="' + panelClass + '">' +
        '<div class="history-snapshot-actions">' +
        '<button class="history-snapshot-btn history-snapshot-view-btn" data-url="' + escapeHtml(url) + '" data-game="' + escapeHtml(entry.game) + '" data-player="' + escapeHtml(entry.player) + '" data-date="' + escapeHtml(entry.date) + '">View full score</button>' +
        '</div>' +
        '</div>';
}

function _bindSnapshotActions(container) {
    if (!container) return;
    container.querySelectorAll('.history-snapshot-view-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const url = this.getAttribute('data-url');
            if (!url) return;
            const entry = {
                game: this.getAttribute('data-game') || 'game',
                player: this.getAttribute('data-player') || 'winner',
                date: this.getAttribute('data-date') || ''
            };
            const filename = _buildSnapshotFilenameForEntry(entry);
            const title = `${entry.game} - ${formatDate(entry.date)}`;
            openScoreSnapshotModal(url, title, filename);
        });
    });
}

export function renderHistory() {
    const container = document.getElementById('historyContainer');
    const toggleBtn = document.getElementById('historyToggleBtn');
    const toggleText = document.getElementById('historyToggleText');
    const toggleIcon = document.getElementById('historyToggleIcon');

    if (data.entries.length === 0) {
        container.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;"><div class="empty-state-icon">📜</div><h3>No History Yet</h3><p>Your game history will appear here</p></div>';
        toggleBtn.style.display = 'none';
        return;
    }

    const sortedEntries = [...data.entries].sort((a, b) => new Date(b.date) - new Date(a.date));
    const totalEntries = sortedEntries.length;
    const defaultHistoryCount = 6;
    const hasMore = totalEntries > defaultHistoryCount;
    toggleBtn.style.display = hasMore ? 'flex' : 'none';

    if (showAllHistory) {
        toggleText.textContent = 'Show Last ' + defaultHistoryCount;
        toggleIcon.classList.add('expanded');
    } else {
        toggleText.textContent = 'Show All (' + totalEntries + ')';
        toggleIcon.classList.remove('expanded');
    }

    let displayEntries = sortedEntries;
    if (!showAllHistory && hasMore) {
        displayEntries = sortedEntries.slice(0, defaultHistoryCount);
    }

    container.innerHTML = displayEntries.map(entry => {
        let auditText = '';
        if (entry.updated_by_name) {
            auditText = 'Edited by ' + entry.updated_by_name + ' · ' + relativeTime(entry.updated_at);
        } else if (entry.created_by_name) {
            auditText = 'Added by ' + entry.created_by_name + ' · ' + relativeTime(entry.created_at);
        }
        const auditHtml = auditText
            ? '<div class="history-card-audit">' + escapeHtml(auditText) + '</div>'
            : '';

        const gameImage = data.gameData && data.gameData[entry.game] && data.gameData[entry.game].image
            ? data.gameData[entry.game].image : null;
        const gameThumbHtml = gameImage
            ? '<img src="' + escapeHtml(gameImage) + '" alt="" class="history-card-game-thumb" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'inline\'"><span style="display:none">🎲</span>'
            : '<span>🎲</span>';

        return '<div class="history-card" data-id="' + entry.id + '">' +
            '<div class="history-card-info">' +
            '<div class="history-card-game">' + gameThumbHtml + ' ' + escapeHtml(entry.game) + '</div>' +
            '<div class="history-card-details">🏆 ' + escapeHtml(entry.player) + ' • 📅 ' + formatDate(entry.date) + '</div>' +
            _renderSnapshotPanel(entry) +
            auditHtml +
            '</div>' +
            '<div class="history-card-actions">' +
            '<button class="history-edit-btn" data-id="' + entry.id + '" title="Edit entry">⚙️</button>' +
            '<button class="history-delete-btn" data-id="' + entry.id + '" title="Delete entry">🗑️</button>' +
            '</div>' +
            '</div>';
    }).join('');

    container.querySelectorAll('.history-edit-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            openEditEntryModal(this.getAttribute('data-id'));
        });
    });
    container.querySelectorAll('.history-delete-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            deleteEntryById(this.getAttribute('data-id'));
        });
    });
    _bindSnapshotActions(container);
}

export function toggleHistoryDisplay() {
    toggleShowAllHistory();
    renderHistory();
}

// These are called from events.js - need to export for use in events
export function selectGame(game) {
    currentEntry.game = game;
    renderGameSelection();
    setTimeout(() => nextStep(2), 150);
}

export function selectPlayer(player) {
    currentEntry.player = player;
    if (!currentEntry.participants || !currentEntry.participants.includes(player)) {
        currentEntry.participants = [player, ...(currentEntry.participants || []).filter(p => p !== player)];
    }
    renderPlayerSelection();
}

export function nextStep(step) {
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    document.getElementById('step' + step).classList.add('active');
    if (step === 3) document.getElementById('winDate').valueAsDate = new Date();
}

export function prevStep(step) {
    nextStep(step);
}

export function resetEntryFlow() {
    currentEntry.game = null;
    currentEntry.player = null;
    currentEntry.date = null;
    currentEntry.participants = [];
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    document.getElementById('step1').classList.add('active');
    document.getElementById('newGameInput').classList.remove('active');
    document.getElementById('newPlayerInput').classList.remove('active');
    document.getElementById('newGameName').value = '';
    document.getElementById('newPlayerName').value = '';
    document.getElementById('newGameImagePreview').style.display = 'none';
    document.getElementById('newPlayerImagePreview').style.display = 'none';
    const _giUrl = document.getElementById('newGameImageUrl');
    const _piUrl = document.getElementById('newPlayerImageUrl');
    if (_giUrl) _giUrl.value = '';
    if (_piUrl) _piUrl.value = '';
    uiState.tempGameImage = null;
    uiState.tempPlayerImage = null;
    renderGameSelection();
    renderPlayerSelection();
}
