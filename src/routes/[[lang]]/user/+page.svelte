<script lang="ts">
  import { invalidateAll } from "$app/navigation";

  // Lucia
  import { page } from "$app/stores";

  // typesafe-i18n
  import LL from "$i18n/i18n-svelte";
  // show/hide Left Sidebar
  import AnimatedHamburger from "$src/components/AnimatedHamburger.svelte";

  // Icons from https://icon-sets.iconify.design/
  import { getUser, handleSession } from "@lucia-auth/sveltekit/client";
  import type { ModalComponent, ModalSettings } from "@skeletonlabs/skeleton";
  // Skeleton
  import { Avatar, modalStore } from "@skeletonlabs/skeleton";
  import axios from "axios";
  import type { PageData } from "./$types";
  import ModalEditAvatar from "./ModalEditAvatar.svelte";
  import ModalEditForm from "./ModalEditForm.svelte";
  import ModalTokenUser from "./ModalTokenUser.svelte";

  import UserList from "./UserList/UserList.svelte";

  export let data: PageData;

  handleSession(page);
  const user = getUser();

  let username = $user?.username;
  let id = $user?.userId;
  let role = $user?.role;
  let email = $user?.email;
  let password = "Hashed neews convert";

  function modalUserForm(): void {
    const modalComponent: ModalComponent = {
      // Pass a reference to your custom component
      ref: ModalEditForm,
      // Add your props as key/value pairs
      props: { background: "bg-red-500" },
      // Provide default slot content as a template literal
      slot: "<p>Edit Form</p>"
    };
    const d: ModalSettings = {
      type: "component",
      // NOTE: title, body, response, etc are supported!
      title: "Edit User Data",
      body: "Modify your data and then press Save.",
      component: modalComponent,
      // Pass abitrary data to the component
      response: async (r: any) => {
        if (r) {
          console.log("response:", r);
          const res = await axios.post("/api/user/editUser", {
            ...r,
            id
          });

          if (res.status === 200) {
            await invalidateAll();
          }
        }
      },

      meta: { foo: "bar", fizz: "buzz", fn: ModalEditForm }
    };
    modalStore.trigger(d);
  }

  function modalEditAvatar(): void {
    const modalComponent: ModalComponent = {
      // Pass a reference to your custom component
      ref: ModalEditAvatar,
      // Add your props as key/value pairs
      props: { background: "bg-red-500" },
      // Provide default slot content as a template literal
      slot: "<p>Edit Form</p>"
    };
    const d: ModalSettings = {
      type: "component",
      // NOTE: title, body, response, etc are supported!
      title: "Edit Avatar",
      body: "Upload new Avatar Image und then press Save.",
      component: modalComponent,
      // Pass abitrary data to the component
      response: async (r: {dataURL: string}) => {
        if (r) {
          console.log("response:", r);

          const formData = new FormData();
          formData.append('dataurl', r.dataURL);
          const res = await axios({
            method: "post",
            url: "/api/user/editAvatar",
            data: formData,
            headers: { "Content-Type": "multipart/form-data" }
          });

          if (res.status === 200) {
            await invalidateAll();
            const resizedDataUrl = res.data.resizedDataUrl;
            avatarSrc = resizedDataUrl;
            $user.avatar = resizedDataUrl;
          }
        }
      },

      meta: { foo: "bar", fizz: "buzz", fn: ModalEditAvatar }
    };
    modalStore.trigger(d);
  }

  function modalTokenUser(): void {
    const modalComponent: ModalComponent = {
      // Pass a reference to your custom component
      ref: ModalTokenUser,
      // Add your props as key/value pairs
      props: { background: "bg-red-500" },
      // Provide default slot content as a template literal
      slot: "<p>Edit Form</p>"
    };
    const d: ModalSettings = {
      type: "component",
      // NOTE: title, body, response, etc are supported!
      title: "Generate Registation token",
      body: "Add User Email and select User Role, then press Send.",
      component: modalComponent,
      // Pass abitrary data to the component
      response: (r: any) => {
        if (r) console.log("response:", r);
      },

      meta: { foo: "bar", fizz: "buzz", fn: ModalEditAvatar }
    };
    modalStore.trigger(d);
  }

  function modalConfirm(): void {
    const d: ModalSettings = {
      type: "confirm",
      title: "Please Confirm User Deletion",
      body: "This cannot be undone. Are you sure you wish to proceed?",
      // TRUE if confirm pressed, FALSE if cancel pressed
      response: (r: boolean) => {
        if (r) console.log("response:", r);
      },
      // Optionally override the button text
      buttonTextCancel: "Cancel",
      buttonTextConfirm: "Delete User"
    };
    modalStore.trigger(d);
  }

  let avatarEdit = true;
  let avatarSrc = $user?.avatar;
  let showUserList = true;

  export let toggleLeftSideBar = true;
  export let open = false;
  export let onClickHambuger = (): void => {
    open = !open;
    toggleLeftSideBar = !toggleLeftSideBar;
  };

  //TODO: Get Roles from allowed user
  let roles: Record<string, boolean> = {
    Admin: true,
    Editor: false,
    User: false,
    Guest: false
  };

  function filter(role: string): void {
    roles[role] = !roles[role];
  }
</script>

<div class="flex mr-1 align-centre mb-2">
  <!-- mobile hamburger -->
  <h1 class="">{$LL.USER_Profile()}</h1>
</div>

<!-- todo: restict max width -->
<div class="grid overflow-hidden grid-cols-1 grid-rows-2 md:grid-cols-2 md:grid-rows-1 gap-1">
  <!-- Avatar with user info -->
  <div class="mt-1 flex flex-col gap-2 mx-2 relative items-center justify-center ">
    <Avatar src={avatarSrc ?? '/Default_User.svg'} initials="AV" rounded-none class="w-32" />

    <button
      on:click={modalEditAvatar}
      class="badge variant-filled-primary w-30 text-black absolute top-1"
    >{$LL.USER_Edit_Avatar()}</button
    >

    <div class="badge variant-filled-secondary mt-1 w-full max-w-xs">
      {$LL.USER_ID()}:<span class="ml-2">{id}</span>
    </div>
    <div class="badge variant-filled-tertiary w-full max-w-xs">
      {$LL.USER_Role()}:<span class="ml-2">{role}</span>
    </div>
  </div>

  <!-- user fields -->
  <form>
    <label
    >{$LL.USER_Username()}:
      <input bind:value={username} name="username" type="text" readonly class="input" />
    </label>
    <label
    >{$LL.USER_Email()}:
      <input bind:value={email} name="email" type="email" readonly class="input" />
    </label>
    <label
    >{$LL.USER_Password()}:
      <input bind:value={password} name="password" type="password" readonly class="input" />
    </label>
    <div class="flex justify-between my-2">
      <button class="btn btn-sm variant-filled-surface  w-full md:w-auto" on:click={modalUserForm}
      >{$LL.USER_Edit()}:
      </button
      >
      <button on:click={modalConfirm} class="btn btn-sm variant-filled-error ">Delete User</button>
    </div>
  </form>
</div>

<!-- admin area -->
{#if $user?.role === 'ADMIN'}
  <div class="my-1 gap-2">
    <hr />
    <h2 class="mb-2">Admin Area</h2>
    <button
      class="btn variant-filled-secondary btn-sm"
      on:click={() => (showUserList = !showUserList)}
    >{showUserList ? $LL.USER_ListCollapse() : $LL.USER_ListShow()}</button
    >
    <button on:click={modalTokenUser} class="btn btn-sm variant-filled-primary w-30 text-black"
    >{$LL.USER_EmailToken()}</button
    >

    {#if showUserList}
      <UserList list={data} />
    {/if}
  </div>
{/if}
