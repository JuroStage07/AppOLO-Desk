export const MOCK_METRICS = {
    hoy: {
        label: "Hoy",
        heroBadge: "Corte diario",
        kpis: [
            {
                label: "Ingresos hoy",
                value: "48",
                hint: "Cantidad de terceros registrados hoy",
                comparison: "+12 vs ayer",
            },
            {
                label: "Visados activos",
                value: "19",
                hint: "Visados vigentes no vencidos",
                comparison: "3 pendientes",
            },
            {
                label: "Equipos revisados",
                value: "27",
                hint: "Checklists cerrados en la jornada",
                comparison: "5 más vs ayer",
            },
            {
                label: "Aperturas",
                value: "6",
                hint: "Aperturas creadas en el día",
                comparison: "2 cerradas hoy",
            },
        ],
        barData: [
            { label: "08h", value: 4 },
            { label: "09h", value: 8 },
            { label: "10h", value: 7 },
            { label: "11h", value: 10 },
            { label: "12h", value: 5 },
            { label: "13h", value: 6 },
            { label: "14h", value: 8 },
        ],
        lineData: [
            { label: "Lun", value: 72 },
            { label: "Mar", value: 75 },
            { label: "Mié", value: 77 },
            { label: "Jue", value: 79 },
            { label: "Vie", value: 81 },
        ],
        compliance: 81,
    },

    semana: {
        label: "Semana",
        heroBadge: "Vista operativa",
        kpis: [
            {
                label: "Terceros ingresados",
                value: "126",
                hint: "Registros acumulados en los últimos 7 días",
                comparison: "+18 vs semana anterior",
            },
            {
                label: "Visados activos",
                value: "42",
                hint: "Visados vigentes dentro del período",
                comparison: "6 por vencer",
            },
            {
                label: "Equipos revisados",
                value: "84",
                hint: "Checklists cerrados semanalmente",
                comparison: "84% del plan",
            },
            {
                label: "Aperturas",
                value: "14",
                hint: "Aperturas generadas en la semana",
                comparison: "Últimos 7 días",
            },
        ],
        barData: [
            { label: "Lun", value: 18 },
            { label: "Mar", value: 26 },
            { label: "Mié", value: 21 },
            { label: "Jue", value: 30 },
            { label: "Vie", value: 24 },
            { label: "Sáb", value: 12 },
            { label: "Dom", value: 8 },
        ],
        lineData: [
            { label: "Sem 1", value: 62 },
            { label: "Sem 2", value: 68 },
            { label: "Sem 3", value: 71 },
            { label: "Sem 4", value: 66 },
            { label: "Sem 5", value: 78 },
        ],
        compliance: 76,
    },

    mes: {
        label: "Mes",
        heroBadge: "Resumen mensual",
        kpis: [
            {
                label: "Terceros ingresados",
                value: "518",
                hint: "Total de ingresos registrados en el mes",
                comparison: "+9% vs mes anterior",
            },
            {
                label: "Visados emitidos",
                value: "96",
                hint: "Visados generados en el período actual",
                comparison: "12 pendientes de aprobación",
            },
            {
                label: "Equipos revisados",
                value: "213",
                hint: "Controles cerrados durante el mes",
                comparison: "91% del objetivo",
            },
            {
                label: "Aperturas",
                value: "37",
                hint: "Aperturas creadas en el mes",
                comparison: "4 cerradas esta semana",
            },
        ],
        barData: [
            { label: "S1", value: 102 },
            { label: "S2", value: 128 },
            { label: "S3", value: 134 },
            { label: "S4", value: 119 },
        ],
        lineData: [
            { label: "Ene", value: 70 },
            { label: "Feb", value: 73 },
            { label: "Mar", value: 77 },
            { label: "Abr", value: 79 },
            { label: "May", value: 82 },
        ],
        compliance: 84,
    },

    rango: {
        label: "Rango personalizado",
        heroBadge: "Vista flexible",
        kpis: [
            {
                label: "Terceros analizados",
                value: "342",
                hint: "Resultado simulado para rango personalizado",
                comparison: "+24 vs rango comparable",
            },
            {
                label: "Visados vigentes",
                value: "58",
                hint: "Documentación activa dentro del rango",
                comparison: "8 por renovar",
            },
            {
                label: "Equipos auditados",
                value: "121",
                hint: "Checklists cerrados en el rango",
                comparison: "87% de cobertura",
            },
            {
                label: "Aperturas registradas",
                value: "22",
                hint: "Eventos generados en el rango consultado",
                comparison: "3 pendientes de cierre",
            },
        ],
        barData: [
            { label: "P1", value: 42 },
            { label: "P2", value: 57 },
            { label: "P3", value: 49 },
            { label: "P4", value: 63 },
            { label: "P5", value: 51 },
        ],
        lineData: [
            { label: "C1", value: 67 },
            { label: "C2", value: 72 },
            { label: "C3", value: 74 },
            { label: "C4", value: 79 },
            { label: "C5", value: 81 },
        ],
        compliance: 79,
    },
};