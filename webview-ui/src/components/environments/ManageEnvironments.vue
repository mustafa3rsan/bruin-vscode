<template>
  <div class="bg-editorWidget-bg shadow sm:rounded-lg p-6 relative">
    <span 
      @click="!isCreating && !isUpdating && (isCollapsed = !isCollapsed)"
      class="codicon absolute top-4 right-4 z-10" 
      :class="[
        isCollapsed ? 'codicon-chevron-down' : 'codicon-chevron-up',
        !isCreating && !isUpdating ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
      ]"
    ></span>

    <div v-if="!isCreating && !isUpdating">
      <div class="flex items-center w-full mb-2">
        <div class="flex items-center">
          <h3 class="text-lg font-medium text-editor-fg">Environments</h3>
        </div>
      </div>
      
      <p class="text-sm text-editor-fg opacity-70 mb-4">
         Manage your environments and create new ones
      </p>

      <div class="mb-8 flex justify-end">
        <vscode-button @click.stop="isCreating = true" class="mt-2 font-semibold">
          <div class="flex items-center">
            <span class="codicon codicon-plus"></span>
            <span class="ml-1">Environment</span>
          </div>
        </vscode-button>  
      </div>

      <div v-if="!isCollapsed">
        <div v-if="environments.length === 0" class="text-sm text-editor-fg opacity-70">
          No environments found. Create your first environment to get started.
        </div>
        <div v-else class="space-y-2">
          <table class="min-w-full divide-y divide-commandCenter-border">
            <thead>
              <tr>
                <th
                  scope="col"
                  class="w-3/5 px-2 py-2 text-left text-sm font-semibold text-editor-fg opacity-70"
                >
                  Name
                </th>
                <th
                  scope="col"
                  class="w-2/5 px-2 py-2 text-right text-sm font-semibold text-editor-fg opacity-70"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="env in environments" :key="env" class="hover:bg-editor-hoverBackground">
                <td class="w-3/5 whitespace-nowrap px-2 py-2 text-sm font-medium text-editor-fg">
                  {{ env }}
                </td>
                <td class="w-2/5 whitespace-nowrap px-2 py-2 text-sm text-right">
                  <div class="flex justify-end items-center">
                    <button
                      @click.stop="startUpdate(env)"
                      class="text-descriptionFg hover:text-editor-fg mr-3 p-1 rounded"
                      title="Update environment"
                    >
                      <span class="codicon codicon-edit h-4 w-4"></span>
                    </button>
                    <button
                      @click.stop="deleteEnvironment(env)"
                      class="text-descriptionFg opacity-70 hover:text-editorError-foreground p-1 rounded"
                      title="Delete environment"
                    >
                      <span class="codicon codicon-trash h-4 w-4"></span>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

     
    </div>

    <!-- Create Environment Form -->
    <div v-else-if="isCreating">
      <h4 class="text-lg font-medium text-editor-fg mb-4">Create New Environment</h4>

      <div class="mb-4">
        <label class="block text-sm font-medium text-editor-fg mb-2"> Environment Name </label>
        <input
          v-model="newEnvironmentName"
          type="text"
          placeholder="Enter environment name"
          class="w-1/2 px-3 py-2 h-8 bg-input-background text-input-foreground border border-input-border rounded focus:outline-none focus:ring-2 focus:ring-inputOption-activeBorder"
          @keyup.enter="createEnvironment"    
          ref="environmentInput"
        />
        <div v-if="errorMessage" class="text-errorForeground text-sm mt-1">
          {{ errorMessage }}
        </div>
      </div>

      <div class="flex justify-end space-x-2">
        <vscode-button @click="cancelCreation" appearance="secondary"> Cancel </vscode-button>
        <vscode-button
          @click="createEnvironment"
          appearance="primary"
          :disabled="!newEnvironmentName.trim()"
        >
          Create
        </vscode-button>
      </div>
    </div>

    <!-- Update Environment Form -->
    <div v-else-if="isUpdating">
      <h4 class="text-lg font-medium text-editor-fg mb-4">Update Environment</h4>

      <div class="mb-4">
        <label class="block text-sm font-medium text-editor-fg mb-2"> Environment Name </label>
        <input
          v-model="updateEnvironmentName"
          type="text"
          placeholder="Enter new environment name"
          class="w-1/2 px-3 py-2 h-8 bg-input-background text-input-foreground border border-input-border rounded focus:outline-none focus:ring-2 focus:ring-inputOption-activeBorder"
          @keyup.enter="updateEnvironment"    
          ref="updateEnvironmentInput"
        />
        <div v-if="errorMessage" class="text-errorForeground text-sm mt-1">
          {{ errorMessage }}
        </div>
      </div>

      <div class="flex justify-end space-x-2">
        <vscode-button @click="cancelUpdate" appearance="secondary"> Cancel </vscode-button>
        <vscode-button
          @click="updateEnvironment"
          appearance="primary"
          :disabled="!updateEnvironmentName.trim()"
        >
          Update
        </vscode-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, watch } from "vue";
import { vscode } from "@/utilities/vscode";

const props = defineProps<{
  environments: string[];
}>();

const isCreating = ref(false);
const isUpdating = ref(false);
const isCollapsed = ref(true);
const newEnvironmentName = ref("");
const updateEnvironmentName = ref("");
const currentEnvironmentName = ref("");
const errorMessage = ref("");
const environmentInput = ref<HTMLInputElement | null>(null);
const updateEnvironmentInput = ref<HTMLInputElement | null>(null);

onMounted(() => {
  window.addEventListener("message", handleMessage);
});

watch(isCreating, (newValue) => {
  if (newValue) {
    focusInput();
  }
});

watch(isUpdating, (newValue) => {
  if (newValue) {
    focusUpdateInput();
  }
});

const handleMessage = (event: MessageEvent) => {
  const message = event.data;
  switch (message.command) {
    case "environment-created-message":
      if (message.payload.status === "success") {
        console.log("Environment created successfully:", message.payload.message);
        cancelCreation();
      } else {
        errorMessage.value = message.payload.message || "Failed to create environment";
      }
      break;
    case "environment-updated-message":
      if (message.payload.status === "success") {
        console.log("Environment updated successfully:", message.payload.message);
        cancelUpdate();
      } else {
        errorMessage.value = message.payload.message || "Failed to update environment";
      }
      break;
  }
};

const cancelCreation = () => {
  isCreating.value = false;
  newEnvironmentName.value = "";
  errorMessage.value = "";
};

const cancelUpdate = () => {
  isUpdating.value = false;
  updateEnvironmentName.value = "";
  currentEnvironmentName.value = "";
  errorMessage.value = "";
};

const createEnvironment = async () => {
  if (!newEnvironmentName.value.trim()) {
    errorMessage.value = "Environment name is required";
    return;
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(newEnvironmentName.value)) {
    errorMessage.value =
      "Environment name can only contain letters, numbers, underscores, and hyphens";
    return;
  }

  if (props.environments.includes(newEnvironmentName.value)) {
    errorMessage.value = "Environment already exists";
    return;
  }

  errorMessage.value = "";

  try {
    await vscode.postMessage({
      command: "bruin.createEnvironment",
      payload: {
        environmentName: newEnvironmentName.value,
      },
    });
  } catch (error) {
    console.error("Error creating environment:", error);
    errorMessage.value = "Failed to create environment";
  }
};

const startUpdate = (environmentName: string) => {
  currentEnvironmentName.value = environmentName;
  updateEnvironmentName.value = environmentName;
  isUpdating.value = true;
  errorMessage.value = "";
};

const updateEnvironment = async () => {
  if (!updateEnvironmentName.value.trim()) {
    errorMessage.value = "Environment name is required";
    return;
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(updateEnvironmentName.value)) {
    errorMessage.value =
      "Environment name can only contain letters, numbers, underscores, and hyphens";
    return;
  }

  if (updateEnvironmentName.value === currentEnvironmentName.value) {
    errorMessage.value = "New name must be different from current name";
    return;
  }

  if (props.environments.includes(updateEnvironmentName.value)) {
    errorMessage.value = "Environment already exists";
    return;
  }

  errorMessage.value = "";

  try {
    // TODO: Implement actual update functionality when CLI command is available
    await vscode.postMessage({
      command: "bruin.updateEnvironment",
      payload: {
        oldEnvironmentName: currentEnvironmentName.value,
        newEnvironmentName: updateEnvironmentName.value,
      },
    });
  } catch (error) {
    console.error("Error updating environment:", error);
    errorMessage.value = "Failed to update environment";
  }
};

const deleteEnvironment = async (environmentName: string) => {
  // TODO: Implement actual delete functionality
  // For now, just show a placeholder action
  console.log("Delete environment:", environmentName);
  
  // Optional: Show confirmation dialog
  // const confirmed = confirm(`Are you sure you want to delete environment "${environmentName}"?`);
  // if (!confirmed) return;
  
  try {
    // TODO: Implement actual delete functionality when CLI command is available
    await vscode.postMessage({
      command: "bruin.deleteEnvironment",
      payload: {
        environmentName: environmentName,
      },
    });
  } catch (error) {
    console.error("Error deleting environment:", error);
  }
};

const focusInput = async () => {
  await nextTick();
  if (environmentInput.value) {
    environmentInput.value.focus();
  }
};

const focusUpdateInput = async () => {
  await nextTick();
  if (updateEnvironmentInput.value) {
    updateEnvironmentInput.value.focus();
  }
};
</script>

<style scoped>
/* Scoped styles can remain if they are simple and don't conflict */
</style>