<script lang="ts">
  import { onMount } from 'svelte';
  import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';

  Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

  let { labels, values, color = '#638aff' } = $props<{
    labels: string[];
    values: number[];
    color?: string;
  }>();

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  onMount(() => {
    chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: color + '20',
          hoverBackgroundColor: color + '40',
          borderColor: color,
          borderWidth: 1,
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: { top: 4, bottom: 4 }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#151926',
            titleColor: '#eaecf5',
            bodyColor: '#9298b4',
            borderColor: 'rgba(255,255,255,0.09)',
            borderWidth: 1,
            cornerRadius: 8,
            padding: { x: 12, y: 8 },
            titleFont: { family: 'Inter', weight: 600, size: 12 },
            bodyFont: { family: 'JetBrains Mono', size: 11 },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.04)', lineWidth: 1 },
            ticks: {
              color: '#5d6380',
              font: { family: 'JetBrains Mono', size: 10 },
              padding: 4,
            },
            border: { display: false },
          },
          y: {
            grid: { display: false },
            ticks: {
              color: '#9298b4',
              font: { family: 'Inter', size: 12, weight: 500 },
              padding: 8,
            },
            border: { display: false },
          },
        },
      },
    });

    return () => { chart?.destroy(); };
  });
</script>

<div class="chart-wrapper">
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .chart-wrapper {
    height: 300px;
    width: 100%;
  }
</style>
