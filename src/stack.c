
#include "includes.h"



void fus_stack_cleanup(fus_stack_t *stack){
    fus_value_detach(stack->tos);
    fus_value_detach(stack->nos);
    ARRAY_FREE_BYVAL(fus_value_t, stack->tail, fus_value_detach)
}

int fus_stack_init(fus_stack_t *stack){
    stack->tos = fus_value_null();
    stack->nos = fus_value_null();
    ARRAY_INIT(stack->tail)
    return 0;
}


int fus_stack_push(fus_stack_t *stack, fus_value_t value){
    if(stack->nos.type != FUS_TYPE_NULL){
        ARRAY_PUSH(fus_value_t, stack->tail, stack->nos)
    }
    stack->nos = stack->tos;
    stack->tos = value;
    fus_value_attach(value);
    return 0;
}

int fus_stack_pop(fus_stack_t *stack, fus_value_t *value_ptr){
    *value_ptr = stack->tos;
    stack->tos = stack->nos;
    if(stack->tail_len > 0){
        ARRAY_POP(fus_value_t, stack->tail, stack->nos)
    }else{
        stack->nos = fus_value_null();
    }
    return 0;
}

