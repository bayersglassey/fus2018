
#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>

#include "core.h"
#include "class.h"
#include "array.h"
#include "vm.h"
#include "collection.h"



int main(int n_args, char *args[]){

    fus_core_t core;
    fus_vm_t vm;

    fus_core_init(&core);
    fus_vm_init(&vm, &core);

    /* ... */

    fus_vm_cleanup(&vm);
    fus_core_cleanup(&core);

    printf("OK\n");
    return 0;
}

