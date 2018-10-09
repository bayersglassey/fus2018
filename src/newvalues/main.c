
#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>

#include "core.h"
#include "class.h"
#include "array.h"
#include "vm.h"



int main(int n_args, char *args[]){
    int err;

    fus_core_t core;
    fus_vm_t vm;

    err = fus_core_init(&core);
    if(err){
        fprintf(stderr, "Couldn't init core\n");
        return EXIT_FAILURE;
    }

    err = fus_vm_init(&vm, &core);
    if(err){
        fprintf(stderr, "Couldn't init VM\n");
        fus_exit(&core, EXIT_FAILURE);
    }

    fus_vm_cleanup(&vm);
    fus_core_cleanup(&core);

    printf("OK\n");
    return 0;
}

