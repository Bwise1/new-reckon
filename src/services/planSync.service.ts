import { planService } from '@/services/plan.service';
import { useTakeoffStore } from '@/store/useTakeoffStore';
import { mapApiPlanToClient, mergePlanLists } from '@/utils/planMapper';
import { hydrateActivePlanView } from '@/utils/planDocument';
import { autoSaveProject } from '@/utils/persistence';

export const fetchAndMergeProjectPlans = async (projectId: string): Promise<void> => {
  if (!localStorage.getItem('token')) return;

  try {
    const response = await planService.listPlans(projectId);
    const apiPlans = response.data?.plans ?? [];
    if (apiPlans.length === 0) return;

    const remotePlans = apiPlans.map(mapApiPlanToClient);

    const store = useTakeoffStore.getState();
    const plans = mergePlanLists(store.plans, remotePlans);
    const currentActive =
      store.activePlanId ? plans.find((p) => p.id === store.activePlanId) : undefined;
    const activePlanId =
      currentActive?.url
        ? currentActive.id
        : plans.find((p) => p.url)?.id ??
          (store.activePlanId && plans.some((p) => p.id === store.activePlanId)
            ? store.activePlanId
            : plans[0]?.id ?? null);

    const view = hydrateActivePlanView({
      plans,
      activePlanId,
      planStates: store.planStates,
      numPages: store.numPages,
      currentPage: store.currentPage,
      scales: store.scales,
      calibrationLines: store.calibrationLines,
      backgroundImage: store.backgroundImage,
    });

    useTakeoffStore.setState({
      plans,
      activePlanId,
      ...view,
    });

    // Persist merged plans to localStorage only — no server push here.
    // We just pulled from the server; pushing back immediately would be circular.
    const state = useTakeoffStore.getState();
    if (state.currentProjectId) {
      autoSaveProject(state.currentProjectId, {
        takeoffItems: state.takeoffItems,
        scales: state.scales,
        calibrationLines: state.calibrationLines,
        currentPage: state.currentPage,
        numPages: state.numPages,
        backgroundImage: state.backgroundImage,
        plans: state.plans,
        activePlanId: state.activePlanId,
        planStates: state.planStates,
        boqElements: state.boqElements,
        pricing: state.pricing,
      });
    }
  } catch (error) {
    console.warn('Failed to fetch project plans from API:', error);
  }
};
