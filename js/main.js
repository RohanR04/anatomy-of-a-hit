// === CONSTANTS ===

const SECTION_COLORS = {
    intro:        '#6366f1',
    verse:        '#3b82f6',
    'pre-chorus': '#06b6d4',
    chorus:       '#f59e0b',
    bridge:       '#ec4899',
    outro:        '#8b5cf6',
    instrumental: '#10b981',
    hook:         '#ef4444',
    breakdown:    '#f97316'
};

const SECTION_ORDER = [
    'intro', 'verse', 'pre-chorus', 'chorus',
    'hook', 'bridge', 'instrumental', 'breakdown', 'outro'
];

const DECADES = ['All', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];

const margin = { top: 30, right: 20, bottom: 30, left: 220 };
const ROW_HEIGHT = 32;
const ROW_GAP = 4;
const BAR_HEIGHT = 22;
const AGG_HEIGHT = 36;

// === STATE ===

let allSongs = [];
let currentDecade = 'All';
let currentSort = 'year';
let highlightSection = null;

// === LOAD & PARSE DATA ===

d3.csv('data/songs.csv').then(raw => {
    allSongs = raw.map(d => {
        const sections = JSON.parse(d.sections);
        const duration = +d.duration_sec;
        const firstChorus = sections.find(s => s.type === 'chorus' || s.type === 'hook');
        const chorusTime = sections
            .filter(s => s.type === 'chorus' || s.type === 'hook')
            .reduce((sum, s) => sum + (s.end - s.start), 0);
        const introSection = sections.find(s => s.type === 'intro');
        return {
            title: d.title,
            artist: d.artist,
            year: +d.year,
            decade: d.decade,
            genre: d.genre,
            duration,
            sections,
            firstChorusTime: firstChorus ? firstChorus.start : duration,
            chorusRatio: chorusTime / duration,
            introLength: introSection ? (introSection.end - introSection.start) : 0
        };
    });

    buildDecadeButtons();
    buildLegend();
    buildSortListener();
    render();
});

// ============================================================
// DECADE FILTER BUTTONS
// ============================================================

function buildDecadeButtons() {
    const container = d3.select('#decade-buttons');

    container.selectAll('button')
        .data(DECADES)
        .join('button')
        .text(d => d)
        .classed('active', d => d === currentDecade)
        .on('click', (event, d) => {
            currentDecade = d;
            container.selectAll('button').classed('active', b => b === d);
            render();
        });
}

// ============================================================
// SORT CONTROLS
// ============================================================

function buildSortListener() {
    d3.select('#sort-select').on('change', function () {
        currentSort = this.value;
        render();
    });
}

function sortSongs(songs) {
    const sorters = {
        year:           (a, b) => a.year - b.year,
        duration:       (a, b) => b.duration - a.duration,
        'first-chorus': (a, b) => a.firstChorusTime - b.firstChorusTime,
        'chorus-ratio': (a, b) => b.chorusRatio - a.chorusRatio,
        'intro-length': (a, b) => b.introLength - a.introLength
    };
    return [...songs].sort(sorters[currentSort] || sorters.year);
}

// ============================================================
// LEGEND (clickable to highlight a section type)
// ============================================================

function buildLegend() {
    const legend = d3.select('#legend');

    const items = legend.selectAll('.legend-item')
        .data(SECTION_ORDER)
        .join('div')
        .attr('class', 'legend-item')
        .on('click', (event, d) => {
            highlightSection = (highlightSection === d) ? null : d;

            legend.selectAll('.legend-item')
                .classed('dimmed', type => highlightSection && type !== highlightSection);

            d3.selectAll('.section-rect')
                .classed('dimmed', function () {
                    if (!highlightSection) return false;
                    return d3.select(this).attr('data-type') !== highlightSection;
                });
        });

    items.append('div')
        .attr('class', 'legend-swatch')
        .style('background', d => SECTION_COLORS[d]);

    items.append('span')
        .attr('class', 'legend-label')
        .text(d => d.replace('-', ' '));
}

// ============================================================
// MAIN RENDER (orchestrates all sub-renders)
// ============================================================

function render() {
    const filtered = currentDecade === 'All'
        ? allSongs
        : allSongs.filter(d => d.decade === currentDecade);

    const sorted = sortSongs(filtered);

    updateInsights(filtered);
    updateAggregate(filtered);
    updateAnnotations(filtered);
    drawChart(sorted);
}

// ============================================================
// INSIGHT CARDS (animated number counters)
// ============================================================

function updateInsights(songs) {
    if (!songs.length) return;

    const avgIntro = d3.mean(songs, d => d.introLength);
    const avgFirstChorus = d3.mean(songs, d => d.firstChorusTime);
    const avgDuration = d3.mean(songs, d => d.duration);
    const avgChorusPct = d3.mean(songs, d => d.chorusRatio) * 100;

    animateNumber('#avg-intro', avgIntro, 's');
    animateNumber('#avg-first-chorus', avgFirstChorus, 's');
    animateNumber('#avg-duration', avgDuration, 's');
    animateNumber('#chorus-pct', avgChorusPct, '%');
}

function animateNumber(selector, target, suffix) {
    const el = d3.select(selector);
    const current = parseFloat(el.text()) || 0;
    el.transition()
        .duration(600)
        .tween('text', function () {
            const i = d3.interpolateNumber(current, target);
            return function (t) {
                this.textContent = Math.round(i(t)) + suffix;
            };
        });
}

// ============================================================
// AGGREGATE STRUCTURE BAR
// ============================================================

function updateAggregate(songs) {
    const label = currentDecade === 'All' ? '(all decades)' : `(${currentDecade})`;
    d3.select('.agg-decade-label').text(label);

    // Compute average proportion per section type
    const totals = {};
    SECTION_ORDER.forEach(t => totals[t] = 0);
    let totalDuration = 0;

    songs.forEach(song => {
        song.sections.forEach(s => {
            const dur = s.end - s.start;
            if (totals[s.type] !== undefined) totals[s.type] += dur;
        });
        totalDuration += song.duration;
    });

    const segments = SECTION_ORDER
        .map(type => ({ type, ratio: totalDuration > 0 ? totals[type] / totalDuration : 0 }))
        .filter(d => d.ratio > 0);

    // Cumulative x positions
    let cumX = 0;
    segments.forEach(d => {
        d.x = cumX;
        cumX += d.ratio;
    });

    const svg = d3.select('#aggregate-bar');
    const width = svg.node().parentElement.clientWidth;
    svg.attr('viewBox', `0 0 ${width} ${AGG_HEIGHT}`);

    // --- Segment rects ---
    svg.selectAll('rect')
        .data(segments, d => d.type)
        .join(
            enter => enter.append('rect')
                .attr('rx', 4)
                .attr('y', 4)
                .attr('height', AGG_HEIGHT - 8)
                .attr('fill', d => SECTION_COLORS[d.type])
                .attr('x', d => d.x * width)
                .attr('width', d => Math.max(0, d.ratio * width - 1.5))
                .attr('opacity', 0)
                .call(e => e.transition().duration(600).attr('opacity', 1)),
            update => update
                .transition().duration(600)
                .attr('x', d => d.x * width)
                .attr('width', d => Math.max(0, d.ratio * width - 1.5))
                .attr('fill', d => SECTION_COLORS[d.type]),
            exit => exit.transition().duration(300).attr('opacity', 0).remove()
        );

    // --- Labels on wide-enough segments ---
    svg.selectAll('text')
        .data(segments.filter(d => d.ratio > 0.07), d => d.type)
        .join(
            enter => enter.append('text')
                .attr('y', AGG_HEIGHT / 2 + 1)
                .attr('dy', '0.35em')
                .attr('text-anchor', 'middle')
                .attr('fill', d => (d.type === 'chorus' || d.type === 'breakdown') ? '#000' : '#fff')
                .attr('font-size', '10px')
                .attr('font-family', 'DM Sans, sans-serif')
                .attr('font-weight', 500)
                .attr('pointer-events', 'none')
                .attr('x', d => (d.x + d.ratio / 2) * width)
                .text(d => `${d.type.replace('-',' ')} ${Math.round(d.ratio * 100)}%`)
                .attr('opacity', 0)
                .call(e => e.transition().duration(600).delay(200).attr('opacity', 1)),
            update => update
                .transition().duration(600)
                .attr('x', d => (d.x + d.ratio / 2) * width)
                .text(d => `${d.type.replace('-',' ')} ${Math.round(d.ratio * 100)}%`),
            exit => exit.transition().duration(200).attr('opacity', 0).remove()
        );
}

// ============================================================
// ANNOTATIONS (contextual insights per decade)
// ============================================================

function updateAnnotations(songs) {
    const container = d3.select('#annotations');
    container.html('');

    if (!songs.length) return;

    const avgIntro = d3.mean(songs, d => d.introLength);
    const avgFC = d3.mean(songs, d => d.firstChorusTime);
    const avgDur = d3.mean(songs, d => d.duration);
    const avgChorus = d3.mean(songs, d => d.chorusRatio) * 100;

    const notes = [];

    // Helper: per-decade stats
    function decadeStat(dec) {
        const ds = allSongs.filter(s => s.decade === dec);
        if (!ds.length) return null;
        return {
            avgFC: d3.mean(ds, d => d.firstChorusTime),
            avgIntro: d3.mean(ds, d => d.introLength),
            avgDur: d3.mean(ds, d => d.duration),
            avgChorus: d3.mean(ds, d => d.chorusRatio) * 100
        };
    }

    if (currentDecade === 'All') {
        const s70 = decadeStat('1970s');
        const s20 = decadeStat('2020s');
        if (s70 && s20) {
            const fcDrop = Math.round(s70.avgFC - s20.avgFC);
            notes.push(`The average time to the first chorus dropped by <strong>${fcDrop} seconds</strong> from the 1970s to the 2020s — listeners today expect the hook almost immediately.`);
            const durDrop = Math.round(s70.avgDur - s20.avgDur);
            notes.push(`Songs have gotten <strong>${durDrop}s shorter</strong> on average since the 1970s. The streaming era rewards brevity — every second counts toward a completed play.`);
        }
        notes.push(`Pre-choruses barely existed before the 1980s. Today they're a <strong>standard part of the formula</strong>, building tension before the payoff.`);
    } else if (currentDecade === '1960s') {
        notes.push(`1960s hits were built on <strong>simple verse-chorus structures</strong>. Many songs, like Sam Cooke's, relied on repeating verses without a traditional chorus at all.`);
        notes.push(`Average song length of <strong>${Math.round(avgDur)}s</strong> — labels kept singles short for radio play and jukebox compatibility.`);
    } else if (currentDecade === '1970s') {
        notes.push(`The 1970s had the <strong>longest average intro</strong> at ${Math.round(avgIntro)}s — artists took their time setting the mood before the vocals kicked in.`);
        notes.push(`With an average of <strong>${Math.round(avgFC)}s</strong> to the first chorus, 70s hits were the slowest to reach their hook. Songs like "Stairway to Heaven" and "Bohemian Rhapsody" deliberately delayed gratification.`);
    } else if (currentDecade === '1980s') {
        notes.push(`The 1980s introduced the <strong>pre-chorus</strong> as a standard structural element — songs like "Billie Jean" and "Take On Me" refined the build-and-release formula.`);
        notes.push(`Instrumental breaks and solos still commanded significant time — <strong>electronic production</strong> gave artists new textures to fill those sections.`);
    } else if (currentDecade === '1990s') {
        notes.push(`The 1990s saw <strong>genre diversification</strong> in structure — grunge, R&B, and pop each developed distinct formulas. R&B tracks like "No Scrubs" lean heavily on pre-chorus/chorus cycles.`);
        notes.push(`Bridges remained common at <strong>${Math.round(d3.mean(songs.filter(s => s.sections.some(sec => sec.type === 'bridge')), d => d.sections.find(s => s.type === 'bridge') ? d.sections.find(s => s.type === 'bridge').end - d.sections.find(s => s.type === 'bridge').start : 0) || 0)}s</strong> average — the "key change bridge" was still a go-to move.`);
    } else if (currentDecade === '2000s') {
        notes.push(`Hip-hop's rise brought the <strong>hook</strong> as a distinct structural element — see "In Da Club" where the hook replaces the traditional chorus entirely.`);
        notes.push(`The first chorus arrives at <strong>${Math.round(avgFC)}s</strong> on average — noticeably faster than previous decades, signaling the shift toward front-loaded song design.`);
    } else if (currentDecade === '2010s') {
        notes.push(`The 2010s show a structural split: ultra-short tracks like "Old Town Road" (113s) coexist with rule-breakers like "Sicko Mode" (312s) that use <strong>multiple beat switches</strong> instead of traditional sections.`);
        notes.push(`The <strong>breakdown</strong> emerged as a new section type, especially in hip-hop and electronic music — a tempo or energy shift mid-song that resets the listener's attention.`);
    } else if (currentDecade === '2020s') {
        notes.push(`2020s hits average just <strong>${Math.round(avgIntro)}s intros</strong> — the shortest ever. In a skip-happy streaming world, songs front-load the chorus to hook listeners immediately.`);
        notes.push(`<strong>${Math.round(avgChorus)}%</strong> of a typical 2020s hit is chorus — the highest ratio of any decade. The chorus IS the song.`);
    }

    notes.forEach((html, i) => {
        container.append('div')
            .attr('class', 'annotation-card')
            .style('animation-delay', `${i * 0.15}s`)
            .html(html);
    });
}

// ============================================================
// MAIN CHART DRAWING
// ============================================================

function drawChart(songs) {
    const containerWidth = document.getElementById('chart-container').clientWidth;
    const innerWidth = containerWidth - margin.left - margin.right;
    const chartHeight = margin.top + songs.length * (ROW_HEIGHT + ROW_GAP) + margin.bottom;

    const svg = d3.select('#chart')
        .attr('viewBox', `0 0 ${containerWidth} ${chartHeight}`)
        .attr('height', chartHeight);

    // X scale: seconds → pixels
    const maxDuration = d3.max(songs, d => d.duration) || 300;
    const xScale = d3.scaleLinear()
        .domain([0, maxDuration])
        .range([0, innerWidth]);

    // Root <g>
    let g = svg.select('g.chart-group');
    if (g.empty()) {
        g = svg.append('g')
            .attr('class', 'chart-group')
            .attr('transform', `translate(${margin.left}, ${margin.top})`);
    }

    // --- Time axis (top) ---
    let topAxis = g.select('.top-axis');
    if (topAxis.empty()) {
        topAxis = g.append('g').attr('class', 'time-axis top-axis');
    }
    topAxis.transition().duration(600).call(
        d3.axisTop(xScale).ticks(6).tickFormat(formatTime)
    );

    // --- Song rows (enter / update / exit) ---
    const rows = g.selectAll('.song-group')
        .data(songs, d => d.title + d.artist);

    // EXIT
    rows.exit()
        .transition().duration(300)
        .attr('opacity', 0)
        .remove();

    // ENTER
    const rowEnter = rows.enter()
        .append('g')
        .attr('class', 'song-group')
        .attr('transform', (d, i) => `translate(0, ${i * (ROW_HEIGHT + ROW_GAP) + 10})`)
        .attr('opacity', 0);

    // Song title label
    rowEnter.append('text')
        .attr('class', 'song-label-title')
        .attr('x', -8)
        .attr('y', BAR_HEIGHT / 2)
        .attr('dy', '0.35em')
        .attr('text-anchor', 'end')
        .text(d => truncateLabel(`${d.title} — ${d.artist}`, 30));

    // Section rectangles
    rowEnter.each(function (song) {
        const row = d3.select(this);
        song.sections.forEach(section => {
            row.append('rect')
                .attr('class', 'section-rect')
                .attr('data-type', section.type)
                .attr('x', xScale(section.start))
                .attr('y', 0)
                .attr('width', Math.max(0, xScale(section.end) - xScale(section.start) - 1))
                .attr('height', BAR_HEIGHT)
                .attr('rx', 3)
                .attr('fill', SECTION_COLORS[section.type] || '#555')
                .classed('dimmed', highlightSection && section.type !== highlightSection)
                .on('mouseenter', (event) => showTooltip(event, song, section))
                .on('mousemove', (event) => moveTooltip(event))
                .on('mouseleave', hideTooltip);
        });
    });

    // Animate entering rows with stagger
    rowEnter.transition()
        .duration(500)
        .delay((d, i) => i * 15)
        .attr('opacity', 1);

    // UPDATE — reposition rows (animated sort)
    rows.transition()
        .duration(600)
        .attr('transform', (d, i) => `translate(0, ${i * (ROW_HEIGHT + ROW_GAP) + 10})`)
        .attr('opacity', 1);

    // Update section rect positions/widths when x scale changes
    rows.each(function (song) {
        d3.select(this).selectAll('.section-rect').each(function (_, i) {
            if (i < song.sections.length) {
                const s = song.sections[i];
                d3.select(this)
                    .transition().duration(600)
                    .attr('x', xScale(s.start))
                    .attr('width', Math.max(0, xScale(s.end) - xScale(s.start) - 1));
            }
        });
    });

    // --- Time axis (bottom) ---
    let bottomAxis = g.select('.bottom-axis');
    if (bottomAxis.empty()) {
        bottomAxis = g.append('g').attr('class', 'time-axis bottom-axis');
    }
    bottomAxis
        .transition().duration(600)
        .attr('transform', `translate(0, ${songs.length * (ROW_HEIGHT + ROW_GAP) + 10})`)
        .call(d3.axisBottom(xScale).ticks(6).tickFormat(formatTime));
}

// ============================================================
// TOOLTIP
// ============================================================

function showTooltip(event, song, section) {
    const dur = section.end - section.start;
    const pct = ((dur / song.duration) * 100).toFixed(1);

    d3.select('#tooltip')
        .html(`
            <div class="tt-title">${song.title}</div>
            <div class="tt-artist">${song.artist} (${song.year})</div>
            <div class="tt-section">
                <span class="tt-swatch" style="background:${SECTION_COLORS[section.type]}"></span>
                <strong>${section.type.replace('-', ' ')}</strong> · ${dur}s (${pct}%)
            </div>
            <div style="color:#8a8a8e; font-size:0.75rem; margin-top:3px">
                ${formatTime(section.start)} – ${formatTime(section.end)}
            </div>
        `)
        .style('opacity', 1);

    moveTooltip(event);
}

function moveTooltip(event) {
    const tt = d3.select('#tooltip').node();
    let x = event.clientX + 14;
    let y = event.clientY - 10;
    if (x + tt.offsetWidth > window.innerWidth - 10) x = event.clientX - tt.offsetWidth - 14;
    if (y + tt.offsetHeight > window.innerHeight - 10) y = event.clientY - tt.offsetHeight - 10;
    d3.select('#tooltip').style('left', x + 'px').style('top', y + 'px');
}

function hideTooltip() {
    d3.select('#tooltip').style('opacity', 0);
}

// ============================================================
// UTILITIES
// ============================================================

function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

function truncateLabel(str, max) {
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

// ============================================================
// RESIZE HANDLER
// ============================================================

window.addEventListener('resize', () => {
    if (allSongs.length) render();
});