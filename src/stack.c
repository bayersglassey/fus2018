
#include "includes.h"



void fus_stack_cleanup(fus_stack_t *stack){
    fus_value_detach(stack->tos);
    fus_value_detach(stack->nos);
    ARRAY_FREE_BYVAL(fus_value_t, stack->tail, fus_value_detach)
}

int fus_stack_init(fus_stack_t *stack){
    ARRAY_INIT(stack->tail)
    return 0;
}

