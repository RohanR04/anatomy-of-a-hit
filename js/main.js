// === CONSTANTS ===

const SECTION_COLORS = {
    intro:        '#7b78f0',
    verse:        '#4a9de0',
    'pre-chorus': '#1ec9be',
    chorus:       '#f5b731',
    bridge:       '#e8527a',
    outro:        '#a970e8',
    instrumental: '#35d47a',
    hook:         '#f07044',
    breakdown:    '#f0a040'
};

const SECTION_ORDER = [
    'intro', 'verse', 'pre-chorus', 'chorus',
    'hook', 'bridge', 'instrumental', 'breakdown', 'outro'
];

const DECADE_LIST = ['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];
const DECADES = ['All', ...DECADE_LIST];

const margin = { top: 30, right: 20, bottom: 30, left: 220 };
const ROW_HEIGHT = 32;
const ROW_GAP = 4;
const BAR_HEIGHT = 22;
const AGG_HEIGHT = 34;

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
    buildSmallMultiples();
    render();
});

// DECADE FILTER BUTTONS

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
            // Sync small multiple highlight
            d3.selectAll('.sm-card').classed('active', function() {
                return d3.select(this).attr('data-decade') === d;
            });
            render();
        });
}

// SORT CONTROLS

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

// LEGEND

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

// MAIN RENDER

function render() {
    const filtered = currentDecade === 'All'
        ? allSongs
        : allSongs.filter(d => d.decade === currentDecade);

    const sorted = sortSongs(filtered);

    updateInsights(filtered);
    updateAnnotations(filtered);
    updateAggregate(filtered);
    drawChart(sorted);
}

// INSIGHT CARDS

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

// ANNOTATIONS (restyled, above chart)

function updateAnnotations(songs) {
    const container = d3.select('#annotations');
    container.html('');

    if (!songs.length) return;

    const avgIntro = d3.mean(songs, d => d.introLength);
    const avgFC = d3.mean(songs, d => d.firstChorusTime);
    const avgDur = d3.mean(songs, d => d.duration);
    const avgChorus = d3.mean(songs, d => d.chorusRatio) * 100;

    const notes = [];

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
            notes.push(`Time to first chorus dropped by <strong>${fcDrop} seconds</strong> from the 1970s to the 2020s — listeners today expect the hook almost immediately.`);
            const durDrop = Math.round(s70.avgDur - s20.avgDur);
            notes.push(`Songs have gotten <strong>${durDrop}s shorter</strong> on average since the 1970s. The streaming era rewards brevity.`);
        }
        notes.push(`Pre-choruses barely existed before the 1980s. Today they're a <strong>standard part of the formula</strong>.`);
    } else if (currentDecade === '1960s') {
        notes.push(`1960s hits were built on <strong>simple verse-chorus structures</strong>. Many relied on repeating verses without a traditional chorus.`);
        notes.push(`Average length of <strong>${Math.round(avgDur)}s</strong> — labels kept singles short for radio and jukebox play.`);
    } else if (currentDecade === '1970s') {
        notes.push(`The 1970s had the <strong>longest average intro</strong> at ${Math.round(avgIntro)}s — artists set the mood before vocals.`);
        notes.push(`Average of <strong>${Math.round(avgFC)}s</strong> to first chorus — the slowest era. Songs like "Stairway to Heaven" deliberately delayed gratification.`);
    } else if (currentDecade === '1980s') {
        notes.push(`The 1980s introduced the <strong>pre-chorus</strong> as standard — "Billie Jean" and "Take On Me" refined build-and-release.`);
        notes.push(`Instrumental breaks stayed prominent — <strong>electronic production</strong> gave artists new textures.`);
    } else if (currentDecade === '1990s') {
        notes.push(`The 1990s saw <strong>genre diversification</strong> in structure — grunge, R&B, and pop each developed distinct formulas.`);
        notes.push(`Bridges averaged ~<strong>28s</strong> — the "key change bridge" was still a go-to move.`);
    } else if (currentDecade === '2000s') {
        notes.push(`Hip-hop brought the <strong>hook</strong> as a distinct element — "In Da Club" replaces the traditional chorus entirely.`);
        notes.push(`First chorus at <strong>${Math.round(avgFC)}s</strong> average — noticeably faster, signaling the shift toward front-loaded design.`);
    } else if (currentDecade === '2010s') {
        notes.push(`A structural split: "Old Town Road" (113s) coexists with "Sicko Mode" (312s) and its <strong>multiple beat switches</strong>.`);
        notes.push(`The <strong>breakdown</strong> emerged as a section type — energy resets that recapture attention.`);
    } else if (currentDecade === '2020s') {
        notes.push(`Just <strong>${Math.round(avgIntro)}s intros</strong> — the shortest ever. Songs front-load the chorus to survive a skip-happy world.`);
        notes.push(`<strong>${Math.round(avgChorus)}%</strong> of a typical 2020s hit is chorus — the highest ratio of any decade.`);
    }

    notes.forEach((html, i) => {
        container.append('div')
            .attr('class', 'annotation-card')
            .style('animation-delay', `${i * 0.12}s`)
            .html(`<span class="annotation-icon">♪</span>${html}`);
    });
}

// AGGREGATE STRUCTURE BAR

function updateAggregate(songs) {
    const label = currentDecade === 'All' ? '(all decades)' : `(${currentDecade})`;
    d3.select('.agg-decade-label').text(label);

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

    let cumX = 0;
    segments.forEach(d => { d.x = cumX; cumX += d.ratio; });

    const svg = d3.select('#aggregate-bar');
    const width = svg.node().parentElement.clientWidth;
    svg.attr('viewBox', `0 0 ${width} ${AGG_HEIGHT}`);

    svg.selectAll('rect')
        .data(segments, d => d.type)
        .join(
            enter => enter.append('rect')
                .attr('rx', 3).attr('y', 3).attr('height', AGG_HEIGHT - 6)
                .attr('fill', d => SECTION_COLORS[d.type])
                .attr('x', d => d.x * width)
                .attr('width', d => Math.max(0, d.ratio * width - 1.5))
                .attr('opacity', 0)
                .call(e => e.transition().duration(600).attr('opacity', 1)),
            update => update.transition().duration(600)
                .attr('x', d => d.x * width)
                .attr('width', d => Math.max(0, d.ratio * width - 1.5)),
            exit => exit.transition().duration(300).attr('opacity', 0).remove()
        );

    svg.selectAll('text')
        .data(segments.filter(d => d.ratio > 0.07), d => d.type)
        .join(
            enter => enter.append('text')
                .attr('y', AGG_HEIGHT / 2 + 1).attr('dy', '0.35em')
                .attr('text-anchor', 'middle')
                .attr('fill', d => d.type === 'chorus' ? '#1a1a21' : '#fff')
                .attr('font-size', '9.5px')
                .attr('font-family', 'Karla, sans-serif')
                .attr('font-weight', 600)
                .attr('pointer-events', 'none')
                .attr('x', d => (d.x + d.ratio / 2) * width)
                .text(d => `${d.type.replace('-',' ')} ${Math.round(d.ratio * 100)}%`)
                .attr('opacity', 0)
                .call(e => e.transition().duration(600).delay(200).attr('opacity', 1)),
            update => update.transition().duration(600)
                .attr('x', d => (d.x + d.ratio / 2) * width)
                .text(d => `${d.type.replace('-',' ')} ${Math.round(d.ratio * 100)}%`),
            exit => exit.transition().duration(200).attr('opacity', 0).remove()
        );
}

// MAIN CHART

function drawChart(songs) {
    const containerWidth = document.getElementById('chart-container').clientWidth;
    const innerWidth = containerWidth - margin.left - margin.right;
    const chartHeight = margin.top + songs.length * (ROW_HEIGHT + ROW_GAP) + margin.bottom;

    const svg = d3.select('#chart')
        .attr('viewBox', `0 0 ${containerWidth} ${chartHeight}`)
        .attr('height', chartHeight);

    const maxDuration = d3.max(songs, d => d.duration) || 300;
    const xScale = d3.scaleLinear().domain([0, maxDuration]).range([0, innerWidth]);

    let g = svg.select('g.chart-group');
    if (g.empty()) {
        g = svg.append('g').attr('class', 'chart-group')
            .attr('transform', `translate(${margin.left}, ${margin.top})`);
    }

    // Top axis
    let topAxis = g.select('.top-axis');
    if (topAxis.empty()) topAxis = g.append('g').attr('class', 'time-axis top-axis');
    topAxis.transition().duration(600).call(d3.axisTop(xScale).ticks(6).tickFormat(formatTime));

    // Song rows
    const rows = g.selectAll('.song-group').data(songs, d => d.title + d.artist);

    rows.exit().transition().duration(300).attr('opacity', 0).remove();

    const rowEnter = rows.enter()
        .append('g').attr('class', 'song-group')
        .attr('transform', (d, i) => `translate(0, ${i * (ROW_HEIGHT + ROW_GAP) + 10})`)
        .attr('opacity', 0);

    rowEnter.append('text')
        .attr('class', 'song-label-title')
        .attr('x', -8).attr('y', BAR_HEIGHT / 2).attr('dy', '0.35em')
        .attr('text-anchor', 'end')
        .text(d => truncateLabel(`${d.title} — ${d.artist}`, 30));

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
                .attr('rx', 2)
                .attr('fill', SECTION_COLORS[section.type] || '#555')
                .classed('dimmed', highlightSection && section.type !== highlightSection)
                .on('mouseenter', (event) => showTooltip(event, song, section))
                .on('mousemove', (event) => moveTooltip(event))
                .on('mouseleave', hideTooltip);
        });
    });

    rowEnter.transition().duration(500).delay((d, i) => i * 15).attr('opacity', 1);

    rows.transition().duration(600)
        .attr('transform', (d, i) => `translate(0, ${i * (ROW_HEIGHT + ROW_GAP) + 10})`)
        .attr('opacity', 1);

    rows.each(function (song) {
        d3.select(this).selectAll('.section-rect').each(function (_, i) {
            if (i < song.sections.length) {
                const s = song.sections[i];
                d3.select(this).transition().duration(600)
                    .attr('x', xScale(s.start))
                    .attr('width', Math.max(0, xScale(s.end) - xScale(s.start) - 1));
            }
        });
    });

    // Bottom axis
    let bottomAxis = g.select('.bottom-axis');
    if (bottomAxis.empty()) bottomAxis = g.append('g').attr('class', 'time-axis bottom-axis');
    bottomAxis.transition().duration(600)
        .attr('transform', `translate(0, ${songs.length * (ROW_HEIGHT + ROW_GAP) + 10})`)
        .call(d3.axisBottom(xScale).ticks(6).tickFormat(formatTime));
}

// TREND CHARTS (interactive, one per metric)

function buildSmallMultiples() {
    const container = d3.select('#sm-container');
    container.html('');

    const decadeData = DECADE_LIST.map(decade => {
        const songs = allSongs.filter(d => d.decade === decade);
        return {
            decade,
            introLength:     d3.mean(songs, d => d.introLength) || 0,
            firstChorusTime: d3.mean(songs, d => d.firstChorusTime) || 0,
            duration:        d3.mean(songs, d => d.duration) || 0,
            chorusRatio:     (d3.mean(songs, d => d.chorusRatio) || 0) * 100
        };
    });

    const metrics = [
        { key: 'introLength',     label: 'Avg Intro Length',     suffix: 's',  color: SECTION_COLORS.intro,
          note: 'Intros shrink as streaming rewards instant hooks' },
        { key: 'firstChorusTime', label: 'Time to First Chorus',  suffix: 's',  color: SECTION_COLORS.chorus,
          note: 'The chorus arrives earlier every decade' },
        { key: 'duration',        label: 'Avg Song Duration',     suffix: 's',  color: SECTION_COLORS.verse,
          note: 'Songs peaked in the 1970s–80s, now shorter again' },
        { key: 'chorusRatio',     label: 'Chorus % of Song',      suffix: '%',  color: SECTION_COLORS['pre-chorus'],
          note: 'More of every song is now pure chorus' }
    ];

    const W = 400, H = 160;
    const padL = 42, padR = 18, padT = 16, padB = 28;

    metrics.forEach(metric => {
        const values = decadeData.map(d => ({ decade: d.decade, value: d[metric.key] }));
        const minVal = d3.min(values, d => d.value);
        const maxVal = d3.max(values, d => d.value);
        const firstVal = values[0].value;
        const lastVal  = values[values.length - 1].value;
        const delta    = lastVal - firstVal;
        const trendUp  = delta > 0;

        const card = container.append('div').attr('class', 'sm-trend-card');

        // Card header
        const hdr = card.append('div').attr('class', 'sm-card-header');
        hdr.append('span').attr('class', 'sm-metric-label').text(metric.label);
        hdr.append('span')
            .attr('class', `sm-trend-pill ${trendUp ? 'trend-up' : 'trend-down'}`)
            .text(`${trendUp ? '▲' : '▼'} ${Math.abs(Math.round(delta))}${metric.suffix} since '60s`);

        card.append('div').attr('class', 'sm-metric-note').text(metric.note);

        // SVG
        const svg = card.append('svg')
            .attr('viewBox', `0 0 ${W} ${H}`)
            .attr('class', 'sm-sparkline');

        const xScale = d3.scalePoint()
            .domain(DECADE_LIST)
            .range([padL, W - padR]);

        const yPad = (maxVal - minVal) * 0.25 || 2;
        const yScale = d3.scaleLinear()
            .domain([minVal - yPad, maxVal + yPad])
            .range([H - padB, padT]);

        // Gridlines + Y ticks
        const yTicks = yScale.ticks(4);
        svg.selectAll('.sm-gridline')
            .data(yTicks)
            .join('line')
            .attr('x1', padL).attr('x2', W - padR)
            .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
            .attr('stroke', '#2c2c34').attr('stroke-width', 1);

        svg.selectAll('.sm-ytick')
            .data(yTicks)
            .join('text')
            .attr('x', padL - 6)
            .attr('y', d => yScale(d))
            .attr('dy', '0.35em')
            .attr('text-anchor', 'end')
            .attr('font-size', '10px')
            .attr('fill', '#918d88')
            .attr('font-family', 'Karla, sans-serif')
            .text(d => Math.round(d) + metric.suffix);

        // Area
        svg.append('path')
            .datum(values)
            .attr('d', d3.area()
                .x(d => xScale(d.decade))
                .y0(H - padB)
                .y1(d => yScale(d.value))
                .curve(d3.curveCatmullRom))
            .attr('fill', metric.color)
            .attr('opacity', 0.1);

        // Line
        svg.append('path')
            .datum(values)
            .attr('d', d3.line()
                .x(d => xScale(d.decade))
                .y(d => yScale(d.value))
                .curve(d3.curveCatmullRom))
            .attr('fill', 'none')
            .attr('stroke', metric.color)
            .attr('stroke-width', 2.5);

        // Static dots
        svg.selectAll('.sm-dot')
            .data(values)
            .join('circle')
            .attr('class', 'sm-dot')
            .attr('cx', d => xScale(d.decade))
            .attr('cy', d => yScale(d.value))
            .attr('r', 4)
            .attr('fill', metric.color)
            .attr('stroke', '#111116')
            .attr('stroke-width', 1.5);

        // X-axis labels
        svg.selectAll('.sm-xtick')
            .data(values)
            .join('text')
            .attr('class', 'sm-xtick')
            .attr('x', d => xScale(d.decade))
            .attr('y', H - 7)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('fill', '#918d88')
            .attr('font-family', 'Karla, sans-serif')
            .text(d => d.decade);

        // --- Interactive crosshair layer ---
        const crosshair = svg.append('line')
            .attr('y1', padT).attr('y2', H - padB)
            .attr('stroke', metric.color)
            .attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '4,3')
            .attr('opacity', 0)
            .attr('pointer-events', 'none');

        const hoverCircle = svg.append('circle')
            .attr('r', 6)
            .attr('fill', metric.color)
            .attr('stroke', '#fff').attr('stroke-width', 2)
            .attr('opacity', 0)
            .attr('pointer-events', 'none');

        // Value badge: background rect + text
        const badgeG = svg.append('g').attr('opacity', 0).attr('pointer-events', 'none');
        const badgeBg = badgeG.append('rect')
            .attr('rx', 4).attr('ry', 4)
            .attr('fill', metric.color);
        const badgeText = badgeG.append('text')
            .attr('dy', '0.35em')
            .attr('font-size', '11px')
            .attr('font-family', 'Karla, sans-serif')
            .attr('font-weight', 700)
            .attr('fill', '#111116');
        const decadeText = svg.append('text')
            .attr('font-size', '9.5px')
            .attr('font-family', 'Karla, sans-serif')
            .attr('fill', '#ddd9d3')
            .attr('opacity', 0)
            .attr('pointer-events', 'none');

        // Hit area
        svg.append('rect')
            .attr('x', padL).attr('y', padT)
            .attr('width', W - padL - padR)
            .attr('height', H - padT - padB)
            .attr('fill', 'transparent')
            .on('mousemove', function(event) {
                const [mx] = d3.pointer(event, svg.node());
                let nearest = values[0], minDist = Infinity;
                values.forEach(v => {
                    const dist = Math.abs(xScale(v.decade) - mx);
                    if (dist < minDist) { minDist = dist; nearest = v; }
                });

                const cx = xScale(nearest.decade);
                const cy = yScale(nearest.value);
                const label = Math.round(nearest.value) + metric.suffix;

                crosshair.attr('x1', cx).attr('x2', cx).attr('opacity', 0.7);
                hoverCircle.attr('cx', cx).attr('cy', cy).attr('opacity', 1);

                // Badge positioning
                badgeText.text(label);
                const bw = label.length * 7.2 + 12;
                const bh = 20;
                const bx = cx > W * 0.65 ? cx - bw - 10 : cx + 10;
                const by = cy - bh / 2;
                badgeBg.attr('x', bx).attr('y', by).attr('width', bw).attr('height', bh);
                badgeText.attr('x', bx + bw / 2).attr('y', by + bh / 2).attr('text-anchor', 'middle');
                badgeG.attr('opacity', 1);

                // Decade label below crosshair
                const anchor = cx > W * 0.65 ? 'end' : 'start';
                decadeText
                    .attr('x', cx > W * 0.65 ? cx - 6 : cx + 6)
                    .attr('y', H - padB + 14)
                    .attr('text-anchor', anchor)
                    .text(nearest.decade)
                    .attr('opacity', 1);
            })
            .on('mouseleave', function() {
                crosshair.attr('opacity', 0);
                hoverCircle.attr('opacity', 0);
                badgeG.attr('opacity', 0);
                decadeText.attr('opacity', 0);
            });
    });
}

// TOOLTIP

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
            <div style="color:#918d88; font-size:0.72rem; margin-top:2px">
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

// UTILITIES

function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

function truncateLabel(str, max) {
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

// RESIZE HANDLER

window.addEventListener('resize', () => {
    if (allSongs.length) render();
});